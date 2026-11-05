use std::sync::{
    atomic::{AtomicBool, AtomicU32, Ordering},
    Arc, Mutex,
};
use std::time::Duration as StdDuration;

use chrono::{DateTime, Utc};
use rusqlite::Connection;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::db::AppState;
use crate::models::auth::Session;
use crate::models::settings::Module;
use crate::models::typing_metric_snapshot::{
    CreateTypingSnapshotPayload, LiveTypingMetrics, TypingStatus,
    DEFAULT_TYPING_WINDOW_DURATION_SECONDS,
};
use crate::services::auth_service::{self, AuthState};
use crate::services::{settings_service, typing_metric_snapshot_service};

pub const TYPING_METRICS_UPDATED_EVENT: &str = "typing-metrics-updated";

const WINDOW_SECONDS: usize = 60;
const ACTIVE_TYPING_RECENCY_SECONDS: usize = 5;
const PEAK_BURST_WINDOW_SECONDS: usize = 5;
const MICRO_PAUSE_MIN_IDLE_SECONDS: usize = 3;
const ACTIVE_MINUTE_MIN_KEYSTROKES: i64 = 5;
const REGENERATIVE_PAUSE_IDLE_SECONDS: u32 = 120;
const REGENERATIVE_PAUSE_INACTIVE_MINUTES: u32 = 2;
const WARNING_CONTINUOUS_MINUTES: i64 = 15;
const DANGER_CONTINUOUS_MINUTES: i64 = 25;

pub fn classify_typing_status(continuous_minutes: i64) -> TypingStatus {
    if continuous_minutes >= DANGER_CONTINUOUS_MINUTES {
        TypingStatus::Danger
    } else if continuous_minutes >= WARNING_CONTINUOUS_MINUTES {
        TypingStatus::Warning
    } else {
        TypingStatus::Good
    }
}

fn count_micro_pauses(window: &[u32; WINDOW_SECONDS]) -> i64 {
    let mut seen_activity = false;
    let mut current_zero_run = 0usize;
    let mut micro_pauses = 0i64;

    for &count in window {
        if count > 0 {
            seen_activity = true;
            current_zero_run = 0;
        } else if seen_activity {
            current_zero_run += 1;
            if current_zero_run == MICRO_PAUSE_MIN_IDLE_SECONDS {
                micro_pauses += 1;
            }
        }
    }

    micro_pauses
}

fn calculate_peak_cpm(window: &[u32; WINDOW_SECONDS]) -> f64 {
    let max_five_second_sum = window
        .windows(PEAK_BURST_WINDOW_SECONDS)
        .map(|slice| slice.iter().sum::<u32>())
        .max()
        .unwrap_or(0);
    f64::from(max_five_second_sum) * (60.0 / PEAK_BURST_WINDOW_SECONDS as f64)
}

/// Pure, stack-friendly cadence aggregator independent of OS APIs and SQLite.
#[derive(Debug, Clone)]
pub struct TypingCadenceAggregator {
    seconds_window: [u32; WINDOW_SECONDS],
    cursor: usize,
    elapsed_window_seconds: u8,
    total_keystrokes: i64,
    continuous_minutes: i64,
    consecutive_idle_seconds: u32,
    consecutive_inactive_minutes: u32,
}

impl Default for TypingCadenceAggregator {
    fn default() -> Self {
        Self {
            seconds_window: [0; WINDOW_SECONDS],
            cursor: 0,
            elapsed_window_seconds: 0,
            total_keystrokes: 0,
            continuous_minutes: 0,
            consecutive_idle_seconds: 0,
            consecutive_inactive_minutes: 0,
        }
    }
}

impl TypingCadenceAggregator {
    fn ordered_window(&self) -> [u32; WINDOW_SECONDS] {
        let mut ordered = [0u32; WINDOW_SECONDS];
        for (i, slot) in ordered.iter_mut().enumerate() {
            *slot = self.seconds_window[(self.cursor + i) % WINDOW_SECONDS];
        }
        ordered
    }

    /// Advances the aggregator by 1 active second and emits a 60s snapshot payload every 60 ticks.
    pub fn tick(
        &mut self,
        session_id: &str,
        keystrokes_in_last_second: u32,
        now_utc: DateTime<Utc>,
    ) -> Option<CreateTypingSnapshotPayload> {
        self.seconds_window[self.cursor] = keystrokes_in_last_second;
        self.cursor = (self.cursor + 1) % WINDOW_SECONDS;
        self.total_keystrokes += i64::from(keystrokes_in_last_second);

        if keystrokes_in_last_second == 0 {
            self.consecutive_idle_seconds = self.consecutive_idle_seconds.saturating_add(1);
            if self.consecutive_idle_seconds >= REGENERATIVE_PAUSE_IDLE_SECONDS {
                self.continuous_minutes = 0;
            }
        } else {
            self.consecutive_idle_seconds = 0;
        }

        self.elapsed_window_seconds += 1;
        if usize::from(self.elapsed_window_seconds) < WINDOW_SECONDS {
            return None;
        }

        let ordered = self.ordered_window();
        let keystrokes_count: i64 = ordered.iter().map(|&k| i64::from(k)).sum();
        let window_duration_seconds = DEFAULT_TYPING_WINDOW_DURATION_SECONDS;
        let cadence_cpm = (keystrokes_count as f64 / window_duration_seconds as f64) * 60.0;
        let peak_cpm = calculate_peak_cpm(&ordered);
        let active_typing_seconds = ordered.iter().filter(|&&k| k > 0).count() as i64;
        let micro_pauses_count = count_micro_pauses(&ordered);

        if keystrokes_count > ACTIVE_MINUTE_MIN_KEYSTROKES {
            self.continuous_minutes += 1;
            self.consecutive_inactive_minutes = 0;
        } else {
            self.consecutive_inactive_minutes = self.consecutive_inactive_minutes.saturating_add(1);
            if self.consecutive_inactive_minutes >= REGENERATIVE_PAUSE_INACTIVE_MINUTES {
                self.continuous_minutes = 0;
            }
        }

        let dominant_status = classify_typing_status(self.continuous_minutes);

        // Reset the 60-second snapshot window counter for the next minute.
        self.elapsed_window_seconds = 0;

        Some(CreateTypingSnapshotPayload {
            session_id: session_id.to_string(),
            timestamp: Some(now_utc.to_rfc3339()),
            window_duration_seconds,
            keystrokes_count,
            cadence_cpm,
            peak_cpm,
            active_typing_seconds,
            micro_pauses_count,
            continuous_typing_minutes: self.continuous_minutes,
            dominant_status,
        })
    }

    pub fn live_metrics(
        &self,
        session_id: Option<String>,
        is_monitoring_active: bool,
    ) -> LiveTypingMetrics {
        let ordered = self.ordered_window();
        let cpm: i64 = ordered.iter().map(|&k| i64::from(k)).sum();
        let peak_cpm = calculate_peak_cpm(&ordered);
        let is_typing = is_monitoring_active
            && ordered[WINDOW_SECONDS - ACTIVE_TYPING_RECENCY_SECONDS..]
                .iter()
                .any(|&k| k > 0);
        let dominant_status = classify_typing_status(self.continuous_minutes);

        LiveTypingMetrics {
            session_id,
            is_monitoring_active,
            is_typing,
            cpm: if is_monitoring_active { cpm } else { 0 },
            peak_cpm: if is_monitoring_active { peak_cpm } else { 0.0 },
            total_keystrokes: self.total_keystrokes,
            continuous_minutes: self.continuous_minutes,
            dominant_status,
        }
    }

    pub fn reset(&mut self) {
        *self = Self::default();
    }
}

/// Stack-local key filter that suppresses OS key auto-repeat and ignores modifier keys.
#[derive(Debug, Default)]
struct KeystrokeFilter {
    pressed_keys: [u64; 4],
}

impl KeystrokeFilter {
    fn reset(&mut self) {
        self.pressed_keys = [0; 4];
    }

    fn is_modifier_vkey(vkey: u16) -> bool {
        matches!(
            vkey,
            0x10 // VK_SHIFT
            | 0xA0 // VK_LSHIFT
            | 0xA1 // VK_RSHIFT
            | 0x11 // VK_CONTROL
            | 0xA2 // VK_LCONTROL
            | 0xA3 // VK_RCONTROL
            | 0x12 // VK_MENU (Alt)
            | 0xA4 // VK_LMENU
            | 0xA5 // VK_RMENU
            | 0x5B // VK_LWIN
            | 0x5C // VK_RWIN
            | 0x14 // VK_CAPITAL (CapsLock)
        )
    }

    fn should_count_vkey(&mut self, vkey: u16, is_key_up: bool) -> bool {
        // Ignore unassigned (0x00) and multi-byte scan-code escape prefix (0xFF).
        if vkey == 0 || vkey >= 0xFF {
            return false;
        }

        let index = vkey as usize;
        let bucket = index / 64;
        let mask = 1u64 << (index % 64);

        if is_key_up {
            self.pressed_keys[bucket] &= !mask;
            return false;
        }

        // Suppress auto-repeat while the physical key remains depressed.
        if (self.pressed_keys[bucket] & mask) != 0 {
            return false;
        }
        self.pressed_keys[bucket] |= mask;

        !Self::is_modifier_vkey(vkey)
    }
}

#[derive(Default)]
struct TypingMonitorSessionState {
    session_id: Option<String>,
    user_id: Option<i64>,
    is_paused: bool,
    module_enabled: bool,
    aggregator: TypingCadenceAggregator,
    last_emitted: Option<LiveTypingMetrics>,
}

impl TypingMonitorSessionState {
    fn is_actively_capturing(&self) -> bool {
        self.module_enabled && self.session_id.is_some() && !self.is_paused
    }

    fn current_live_metrics(&self) -> LiveTypingMetrics {
        let active = self.is_actively_capturing();
        self.aggregator
            .live_metrics(self.session_id.clone(), active)
    }
}

type MetricsEmitter = Arc<dyn Fn(&LiveTypingMetrics) + Send + Sync>;

struct TypingMonitorShared {
    capture_enabled: Arc<AtomicBool>,
    pending_keystrokes: Arc<AtomicU32>,
    stop_signal: Arc<AtomicBool>,
    #[cfg(target_os = "windows")]
    listener_thread_id: Arc<AtomicU32>,
    session_state: Mutex<TypingMonitorSessionState>,
    emitter: Option<MetricsEmitter>,
}

#[derive(Clone)]
pub struct TypingMonitorControl {
    inner: Arc<TypingMonitorShared>,
}

/// Checks whether the current authentication session and user module settings allow typing capture.
pub fn resolve_typing_access(
    conn: &Connection,
    auth_state: &AuthState,
) -> Result<(bool, Option<i64>, bool), String> {
    let session = auth_service::get_session(auth_state)
        .map_err(|_| "Failed to read authentication session".to_string())?;

    match session {
        Session::Anonymous => Ok((false, None, false)),
        Session::Guest => Ok((true, None, true)),
        Session::Authenticated { user } => {
            let enabled =
                settings_service::is_module_enabled(conn, user.id, Module::TypingAnalysis)?;
            Ok((true, Some(user.id), enabled))
        }
    }
}

impl TypingMonitorControl {
    fn with_emitter(emitter: Option<MetricsEmitter>) -> Self {
        Self {
            inner: Arc::new(TypingMonitorShared {
                capture_enabled: Arc::new(AtomicBool::new(false)),
                pending_keystrokes: Arc::new(AtomicU32::new(0)),
                stop_signal: Arc::new(AtomicBool::new(false)),
                #[cfg(target_os = "windows")]
                listener_thread_id: Arc::new(AtomicU32::new(0)),
                session_state: Mutex::new(TypingMonitorSessionState {
                    module_enabled: true,
                    ..TypingMonitorSessionState::default()
                }),
                emitter,
            }),
        }
    }

    #[cfg(test)]
    pub(crate) fn new_for_tests() -> Self {
        Self::with_emitter(None)
    }

    fn emit_if_changed(&self, live: &LiveTypingMetrics, changed: bool) {
        if changed {
            if let Some(emitter) = &self.inner.emitter {
                emitter(live);
            }
        }
    }

    fn sync_atomic_gate(&self, state: &TypingMonitorSessionState) {
        let active = state.is_actively_capturing();
        self.inner.capture_enabled.store(active, Ordering::Relaxed);
        if !active {
            self.inner.pending_keystrokes.swap(0, Ordering::Relaxed);
        }
    }

    pub fn attach_session(
        &self,
        user_id: Option<i64>,
        session_id: String,
        module_enabled: bool,
    ) -> Result<LiveTypingMetrics, String> {
        let (live, changed) = {
            let mut state = self
                .inner
                .session_state
                .lock()
                .map_err(|_| "Failed to lock typing monitor state".to_string())?;

            let is_same_session = state.session_id.as_deref() == Some(session_id.as_str());
            state.user_id = user_id;
            state.module_enabled = module_enabled;
            if !is_same_session {
                state.session_id = Some(session_id);
                state.is_paused = false;
                state.aggregator.reset();
                self.inner.pending_keystrokes.swap(0, Ordering::Relaxed);
            }

            self.sync_atomic_gate(&state);
            let live = state.current_live_metrics();
            let changed = state.last_emitted.as_ref() != Some(&live);
            if changed {
                state.last_emitted = Some(live.clone());
            }
            (live, changed)
        };

        self.emit_if_changed(&live, changed);
        Ok(live)
    }

    pub fn detach_session(&self, session_id: &str) -> Result<LiveTypingMetrics, String> {
        let (live, changed) = {
            let mut state = self
                .inner
                .session_state
                .lock()
                .map_err(|_| "Failed to lock typing monitor state".to_string())?;

            if state.session_id.as_deref() == Some(session_id) {
                state.session_id = None;
                state.user_id = None;
                state.is_paused = false;
                state.aggregator.reset();
            }

            self.sync_atomic_gate(&state);
            let live = state.current_live_metrics();
            let changed = state.last_emitted.as_ref() != Some(&live);
            if changed {
                state.last_emitted = Some(live.clone());
            }
            (live, changed)
        };

        self.emit_if_changed(&live, changed);
        Ok(live)
    }

    pub fn clear_all(&self) -> Result<LiveTypingMetrics, String> {
        let (live, changed) = {
            let mut state = self
                .inner
                .session_state
                .lock()
                .map_err(|_| "Failed to lock typing monitor state".to_string())?;

            state.session_id = None;
            state.user_id = None;
            state.is_paused = false;
            state.module_enabled = false;
            state.aggregator.reset();

            self.sync_atomic_gate(&state);
            let live = state.current_live_metrics();
            let changed = state.last_emitted.as_ref() != Some(&live);
            if changed {
                state.last_emitted = Some(live.clone());
            }
            (live, changed)
        };

        self.emit_if_changed(&live, changed);
        Ok(live)
    }

    pub fn on_module_disabled(&self) -> Result<LiveTypingMetrics, String> {
        let (live, changed) = {
            let mut state = self
                .inner
                .session_state
                .lock()
                .map_err(|_| "Failed to lock typing monitor state".to_string())?;

            state.module_enabled = false;
            state.aggregator.reset();

            self.sync_atomic_gate(&state);
            let live = state.current_live_metrics();
            let changed = state.last_emitted.as_ref() != Some(&live);
            if changed {
                state.last_emitted = Some(live.clone());
            }
            (live, changed)
        };

        self.emit_if_changed(&live, changed);
        Ok(live)
    }

    pub fn on_module_enabled(&self) -> Result<LiveTypingMetrics, String> {
        let (live, changed) = {
            let mut state = self
                .inner
                .session_state
                .lock()
                .map_err(|_| "Failed to lock typing monitor state".to_string())?;

            state.module_enabled = true;
            self.sync_atomic_gate(&state);
            let live = state.current_live_metrics();
            let changed = state.last_emitted.as_ref() != Some(&live);
            if changed {
                state.last_emitted = Some(live.clone());
            }
            (live, changed)
        };

        self.emit_if_changed(&live, changed);
        Ok(live)
    }

    pub fn get_live_metrics(&self) -> Result<LiveTypingMetrics, String> {
        let state = self
            .inner
            .session_state
            .lock()
            .map_err(|_| "Failed to lock typing monitor state".to_string())?;
        Ok(state.current_live_metrics())
    }

    pub fn set_paused(&self, paused: bool) -> Result<LiveTypingMetrics, String> {
        let (live, changed) = {
            let mut state = self
                .inner
                .session_state
                .lock()
                .map_err(|_| "Failed to lock typing monitor state".to_string())?;

            state.is_paused = paused;
            self.sync_atomic_gate(&state);
            let live = state.current_live_metrics();
            let changed = state.last_emitted.as_ref() != Some(&live);
            if changed {
                state.last_emitted = Some(live.clone());
            }
            (live, changed)
        };

        self.emit_if_changed(&live, changed);
        Ok(live)
    }

    pub fn reset_session_metrics(&self) -> Result<LiveTypingMetrics, String> {
        let (live, changed) = {
            let mut state = self
                .inner
                .session_state
                .lock()
                .map_err(|_| "Failed to lock typing monitor state".to_string())?;

            state.aggregator.reset();
            self.inner.pending_keystrokes.swap(0, Ordering::Relaxed);
            let live = state.current_live_metrics();
            let changed = state.last_emitted.as_ref() != Some(&live);
            if changed {
                state.last_emitted = Some(live.clone());
            }
            (live, changed)
        };

        self.emit_if_changed(&live, changed);
        Ok(live)
    }

    pub fn is_capture_enabled(&self) -> bool {
        self.inner.capture_enabled.load(Ordering::Relaxed)
    }

    #[cfg(test)]
    pub(crate) fn add_simulated_keystrokes(&self, count: u32) {
        if self.inner.capture_enabled.load(Ordering::Relaxed) {
            self.inner
                .pending_keystrokes
                .fetch_add(count, Ordering::Relaxed);
        }
    }

    /// Executes one 1-second worker cycle against SQLite and AuthState.
    pub fn poll_tick(
        &self,
        conn: &Connection,
        auth_state: &AuthState,
        now_utc: DateTime<Utc>,
    ) -> Result<(), String> {
        let (has_valid_auth, auth_user_id, module_enabled) =
            resolve_typing_access(conn, auth_state)?;

        let (snapshot_to_persist, live, changed) = {
            let mut state = self
                .inner
                .session_state
                .lock()
                .map_err(|_| "Failed to lock typing monitor state".to_string())?;

            state.module_enabled = has_valid_auth && module_enabled;

            if !has_valid_auth || state.user_id != auth_user_id {
                state.session_id = None;
                state.user_id = None;
                state.is_paused = false;
                state.aggregator.reset();
            } else if !module_enabled {
                state.aggregator.reset();
            }

            let snapshot_payload = if state.is_actively_capturing() {
                self.inner.capture_enabled.store(true, Ordering::Relaxed);
                let keys = self.inner.pending_keystrokes.swap(0, Ordering::Relaxed);
                let session_id = state.session_id.clone().unwrap_or_default();
                state.aggregator.tick(&session_id, keys, now_utc)
            } else {
                self.sync_atomic_gate(&state);
                None
            };

            let live = state.current_live_metrics();
            let changed = state.last_emitted.as_ref() != Some(&live);
            if changed {
                state.last_emitted = Some(live.clone());
            }

            (snapshot_payload, live, changed)
        };

        if let Some(payload) = snapshot_to_persist {
            typing_metric_snapshot_service::record_typing_snapshot(conn, payload)?;
        }

        self.emit_if_changed(&live, changed);
        Ok(())
    }

    pub fn stop(&self) {
        self.inner.stop_signal.store(true, Ordering::Release);
        self.inner.capture_enabled.store(false, Ordering::Relaxed);
        self.inner.pending_keystrokes.swap(0, Ordering::Relaxed);

        #[cfg(target_os = "windows")]
        {
            let tid = self.inner.listener_thread_id.load(Ordering::Acquire);
            if tid != 0 {
                unsafe {
                    let _ = windows_sys::Win32::UI::WindowsAndMessaging::PostThreadMessageW(
                        tid,
                        windows_sys::Win32::UI::WindowsAndMessaging::WM_QUIT,
                        0,
                        0,
                    );
                }
            }
        }
    }
}

pub fn start<R: Runtime>(app: AppHandle<R>) -> std::io::Result<TypingMonitorControl> {
    let emit_app = app.clone();
    let emitter: MetricsEmitter = Arc::new(move |live: &LiveTypingMetrics| {
        let _ = emit_app.emit(TYPING_METRICS_UPDATED_EVENT, live);
    });
    let control = TypingMonitorControl::with_emitter(Some(emitter));

    let listener_capture = control.inner.capture_enabled.clone();
    let listener_pending = control.inner.pending_keystrokes.clone();
    let listener_stop = control.inner.stop_signal.clone();
    #[cfg(target_os = "windows")]
    let listener_tid = control.inner.listener_thread_id.clone();

    std::thread::Builder::new()
        .name("typing-input-listener".into())
        .spawn(move || {
            #[cfg(target_os = "windows")]
            run_windows_raw_input_listener(
                listener_capture,
                listener_pending,
                listener_stop,
                listener_tid,
            );

            #[cfg(not(target_os = "windows"))]
            run_rdev_fallback_listener(listener_capture, listener_pending, listener_stop);
        })?;

    let worker_control = control.clone();
    let worker_stop = control.inner.stop_signal.clone();
    std::thread::Builder::new()
        .name("typing-monitor-worker".into())
        .spawn(move || {
            while !worker_stop.load(Ordering::Relaxed) {
                if let Err(error) = poll_app(&app, &worker_control) {
                    eprintln!("Typing monitor worker failed: {error}");
                }
                std::thread::sleep(StdDuration::from_secs(1));
            }
        })?;

    Ok(control)
}

fn poll_app<R: Runtime>(app: &AppHandle<R>, control: &TypingMonitorControl) -> Result<(), String> {
    let state = app.state::<AppState>();
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let auth_state = app.state::<AuthState>();
    control.poll_tick(&conn, &auth_state, Utc::now())
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn raw_input_wnd_proc(
    hwnd: windows_sys::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows_sys::Win32::Foundation::WPARAM,
    lparam: windows_sys::Win32::Foundation::LPARAM,
) -> windows_sys::Win32::Foundation::LRESULT {
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::DefWindowProcW(hwnd, msg, wparam, lparam)
    }
}

#[cfg(target_os = "windows")]
fn run_windows_raw_input_listener(
    capture_enabled: Arc<AtomicBool>,
    pending_keystrokes: Arc<AtomicU32>,
    stop_signal: Arc<AtomicBool>,
    listener_thread_id: Arc<AtomicU32>,
) {
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;
    use windows_sys::Win32::UI::Input::{
        GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE,
        RAWINPUTHEADER, RIDEV_INPUTSINK, RID_INPUT, RIM_TYPEKEYBOARD,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DestroyWindow, DispatchMessageW, GetMessageW, PeekMessageW,
        RegisterClassW, TranslateMessage, HWND_MESSAGE, MSG, PM_NOREMOVE, RI_KEY_BREAK, WM_INPUT,
        WNDCLASSW,
    };

    let class_name: Vec<u16> = "ErgoTypingRawInputSink\0".encode_utf16().collect();

    unsafe {
        let hinstance = GetModuleHandleW(std::ptr::null());
        let mut wc: WNDCLASSW = std::mem::zeroed();
        wc.lpfnWndProc = Some(raw_input_wnd_proc);
        wc.hInstance = hinstance;
        wc.lpszClassName = class_name.as_ptr();
        let _ = RegisterClassW(&wc);

        let hwnd = CreateWindowExW(
            0,
            class_name.as_ptr(),
            std::ptr::null(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            std::ptr::null_mut(),
            hinstance,
            std::ptr::null(),
        );
        if hwnd.is_null() {
            eprintln!("Failed to create message-only window for typing monitor");
            return;
        }

        let device = RAWINPUTDEVICE {
            usUsagePage: 0x01,
            usUsage: 0x06,
            dwFlags: RIDEV_INPUTSINK,
            hwndTarget: hwnd,
        };
        if RegisterRawInputDevices(
            &device,
            1,
            std::mem::size_of::<RAWINPUTDEVICE>() as u32,
        ) == 0
        {
            eprintln!("Failed to register raw input keyboard sink");
            let _ = DestroyWindow(hwnd);
            return;
        }

        // Ensure thread message queue exists before publishing thread ID for WM_QUIT shutdown.
        let mut init_msg: MSG = std::mem::zeroed();
        let _ = PeekMessageW(&mut init_msg, std::ptr::null_mut(), 0, 0, PM_NOREMOVE);
        listener_thread_id.store(GetCurrentThreadId(), Ordering::Release);

        if stop_signal.load(Ordering::Acquire) {
            let _ = DestroyWindow(hwnd);
            return;
        }

        let mut filter = KeystrokeFilter::default();
        let mut msg: MSG = std::mem::zeroed();

        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            if stop_signal.load(Ordering::Relaxed) {
                break;
            }

            if msg.message == WM_INPUT {
                if capture_enabled.load(Ordering::Relaxed) {
                    let mut raw: RAWINPUT = std::mem::zeroed();
                    let mut size = std::mem::size_of::<RAWINPUT>() as u32;
                    let copied = GetRawInputData(
                        msg.lParam as HRAWINPUT,
                        RID_INPUT,
                        &mut raw as *mut RAWINPUT as *mut core::ffi::c_void,
                        &mut size,
                        std::mem::size_of::<RAWINPUTHEADER>() as u32,
                    );

                    if copied != u32::MAX && raw.header.dwType == RIM_TYPEKEYBOARD {
                        let keyboard = raw.data.keyboard;
                        let is_key_up = (keyboard.Flags & (RI_KEY_BREAK as u16)) != 0;
                        if filter.should_count_vkey(keyboard.VKey, is_key_up) {
                            pending_keystrokes.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                } else {
                    filter.reset();
                }
            }

            let _ = TranslateMessage(&msg);
            let _ = DispatchMessageW(&msg);
        }

        let _ = DestroyWindow(hwnd);
    }
}

#[cfg(not(target_os = "windows"))]
fn run_rdev_fallback_listener(
    capture_enabled: Arc<AtomicBool>,
    pending_keystrokes: Arc<AtomicU32>,
    stop_signal: Arc<AtomicBool>,
) {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    fn is_rdev_modifier(key: rdev::Key) -> bool {
        matches!(
            key,
            rdev::Key::ShiftLeft
                | rdev::Key::ShiftRight
                | rdev::Key::ControlLeft
                | rdev::Key::ControlRight
                | rdev::Key::Alt
                | rdev::Key::AltGr
                | rdev::Key::MetaLeft
                | rdev::Key::MetaRight
                | rdev::Key::CapsLock
        )
    }

    fn map_rdev_slot(key: rdev::Key) -> u16 {
        let mut hasher = DefaultHasher::new();
        std::mem::discriminant(&key).hash(&mut hasher);
        if let rdev::Key::Unknown(code) = key {
            code.hash(&mut hasher);
        }
        ((hasher.finish() % 253) as u16) + 1
    }

    let mut filter = KeystrokeFilter::default();
    if let Err(error) = rdev::listen(move |event| {
        if stop_signal.load(Ordering::Relaxed) {
            return;
        }
        if !capture_enabled.load(Ordering::Relaxed) {
            filter.reset();
            return;
        }

        match event.event_type {
            rdev::EventType::KeyPress(key) => {
                let slot = map_rdev_slot(key);
                let is_mod = is_rdev_modifier(key);
                if filter.should_count_vkey(slot, false) && !is_mod {
                    pending_keystrokes.fetch_add(1, Ordering::Relaxed);
                }
            }
            rdev::EventType::KeyRelease(key) => {
                let slot = map_rdev_slot(key);
                let _ = filter.should_count_vkey(slot, true);
            }
            _ => {}
        }
    }) {
        eprintln!("Fallback keyboard listener stopped: {error:?}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    use crate::models::monitoring_session::MonitoringSession;
    use crate::models::settings::{Module, SetModuleEnabledPayload};
    use crate::models::user::CreateUserPayload;
    use crate::repositories::monitoring_session_repository;
    use crate::services::{auth_service, settings_service, user_service};

    fn utc_at(minute: u32, second: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 11, 4, 14, minute, second)
            .unwrap()
    }

    fn setup_test_env() -> (Connection, AuthState, i64) {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();

        let user = user_service::create_user(
            &conn,
            CreateUserPayload {
                external_id: None,
                first_name: "Ana".to_string(),
                last_name: "Silva".to_string(),
                birth_date: "1995-04-12".to_string(),
                email: "ana@ergo.dev".to_string(),
                phone: "11999999999".to_string(),
                password: "Password123!".to_string(),
                photo: None,
            },
        )
        .unwrap();

        let auth_state = AuthState::new().unwrap();
        auth_service::login(
            &conn,
            &auth_state,
            "ana@ergo.dev".to_string(),
            "Password123!".to_string(),
        )
        .unwrap();

        let session = MonitoringSession {
            id: "session-1".to_string(),
            user_id: Some(user.id),
            started_at: "2026-11-04T14:00:00Z".to_string(),
            ended_at: None,
            duration_seconds: 0,
            average_score: 100.0,
            good_posture_percentage: 100.0,
            warning_posture_percentage: 0.0,
            danger_posture_percentage: 0.0,
            total_alerts_count: 0,
            created_at: Some("2026-11-04T14:00:00Z".to_string()),
            updated_at: Some("2026-11-04T14:00:00Z".to_string()),
        };
        monitoring_session_repository::insert(&conn, &session).unwrap();

        (conn, auth_state, user.id)
    }

    #[test]
    fn keystroke_filter_ignores_modifiers_and_auto_repeat() {
        let mut filter = KeystrokeFilter::default();

        // Regular key ('A' = 0x41): counts once on press, ignores repeats until released.
        assert!(filter.should_count_vkey(0x41, false));
        assert!(!filter.should_count_vkey(0x41, false));
        assert!(!filter.should_count_vkey(0x41, false));
        assert!(!filter.should_count_vkey(0x41, true));
        assert!(filter.should_count_vkey(0x41, false));

        // Pure modifier keys must never count.
        for modifier in [
            0x10, 0xA0, 0xA1, 0x11, 0xA2, 0xA3, 0x12, 0xA4, 0xA5, 0x5B, 0x5C, 0x14,
        ] {
            assert!(!filter.should_count_vkey(modifier, false));
            assert!(!filter.should_count_vkey(modifier, true));
        }

        // Escape prefix 0xFF and unassigned 0x00 must be ignored.
        assert!(!filter.should_count_vkey(0x00, false));
        assert!(!filter.should_count_vkey(0xFF, false));
    }

    #[test]
    fn aggregator_computes_exact_metrics_over_60_ticks_and_rotates_window() {
        let mut agg = TypingCadenceAggregator::default();

        // Simulate 60 seconds:
        // - Seconds 0..5: [4, 4, 4, 4, 4] -> 20 keys (5-second burst = 20 * 12 = 240.0 peak CPM)
        // - Seconds 5..8: [0, 0, 0] -> 3s idle (micro-pause #1)
        // - Seconds 8..10: [2, 2] -> 4 keys
        // - Seconds 10..12: [0, 0] -> only 2s idle (NOT a micro-pause)
        // - Seconds 12..15: [3, 3, 3] -> 9 keys
        // - Seconds 15..60: 45s of zeros (micro-pause #2)
        // Totals: keystrokes = 33, active_typing_seconds = 10, micro_pauses_count = 2, peak_cpm = 240.0
        let mut pattern = [0u32; 60];
        pattern[0..5].fill(4);
        pattern[8..10].fill(2);
        pattern[12..15].fill(3);

        let mut emitted = None;
        for (sec, &keys) in pattern.iter().enumerate() {
            let result = agg.tick("session-1", keys, utc_at(0, sec as u32));
            if sec < 59 {
                assert!(result.is_none());
            } else {
                emitted = result;
            }

            let live = agg.live_metrics(Some("session-1".to_string()), true);
            if sec == 14 {
                assert!(live.is_typing);
            }
            if sec == 20 {
                // 6 seconds after last keystroke at sec 14 -> is_typing turns false while CPM remains 33.
                assert!(!live.is_typing);
                assert_eq!(live.cpm, 33);
            }
        }

        let snapshot = emitted.expect("Expected snapshot on the 60th tick");
        assert_eq!(snapshot.session_id, "session-1");
        assert_eq!(snapshot.window_duration_seconds, 60);
        assert_eq!(snapshot.keystrokes_count, 33);
        assert_eq!(snapshot.cadence_cpm, 33.0);
        assert_eq!(snapshot.peak_cpm, 240.0);
        assert_eq!(snapshot.active_typing_seconds, 10);
        assert_eq!(snapshot.micro_pauses_count, 2);
        assert_eq!(snapshot.continuous_typing_minutes, 1);
        assert_eq!(snapshot.dominant_status, TypingStatus::Good);

        // Next 60 seconds with 0 keystrokes must emit a clean zeroed window for minute 2.
        let mut second_snapshot = None;
        for sec in 0..60 {
            second_snapshot = agg.tick("session-1", 0, utc_at(1, sec));
        }
        let second_snapshot = second_snapshot.expect("Expected second snapshot at 120s");
        assert_eq!(second_snapshot.keystrokes_count, 0);
        assert_eq!(second_snapshot.cadence_cpm, 0.0);
        assert_eq!(second_snapshot.peak_cpm, 0.0);
        assert_eq!(second_snapshot.active_typing_seconds, 0);
        assert_eq!(second_snapshot.micro_pauses_count, 0);
        // Total session keystrokes remain preserved across minutes.
        assert_eq!(
            agg.live_metrics(Some("session-1".to_string()), true)
                .total_keystrokes,
            33
        );
    }

    #[test]
    fn aggregator_tracks_continuous_minutes_statuses_and_resets_after_120_idle_seconds() {
        let mut agg = TypingCadenceAggregator::default();

        // Simulate 25 active minutes (> 5 keys/min): status progresses Good -> Warning (15) -> Danger (25).
        for minute in 0..25 {
            let mut snap = None;
            for sec in 0..60 {
                let keys = if sec < 10 { 2 } else { 0 }; // 20 keys/min
                snap = agg.tick("session-1", keys, utc_at(minute, sec));
            }
            let snap = snap.unwrap();
            let expected_minutes = i64::from(minute) + 1;
            assert_eq!(snap.continuous_typing_minutes, expected_minutes);
            if expected_minutes < 15 {
                assert_eq!(snap.dominant_status, TypingStatus::Good);
            } else if expected_minutes < 25 {
                assert_eq!(snap.dominant_status, TypingStatus::Warning);
            } else {
                assert_eq!(snap.dominant_status, TypingStatus::Danger);
            }
        }

        // Note: the 25th minute already ended with 50 idle seconds (sec 10..60).
        // After 70 more idle seconds (total 120 consecutive idle seconds), continuous_minutes must reset to 0.
        for sec in 0..69 {
            agg.tick("session-1", 0, utc_at(25, sec % 60));
            assert_eq!(
                agg.live_metrics(Some("session-1".to_string()), true)
                    .continuous_minutes,
                25
            );
        }

        agg.tick("session-1", 0, utc_at(26, 9));
        let reset_live = agg.live_metrics(Some("session-1".to_string()), true);
        assert_eq!(reset_live.continuous_minutes, 0);
        assert_eq!(reset_live.dominant_status, TypingStatus::Good);
    }

    #[test]
    fn control_persists_snapshots_and_blocks_counting_when_module_disabled_or_logged_out() {
        let (conn, auth_state, user_id) = setup_test_env();
        let control = TypingMonitorControl::new_for_tests();

        control
            .attach_session(Some(user_id), "session-1".to_string(), true)
            .unwrap();
        assert!(control.is_capture_enabled());

        for sec in 0..60 {
            control.add_simulated_keystrokes(3);
            control.poll_tick(&conn, &auth_state, utc_at(0, sec)).unwrap();
        }

        let saved =
            typing_metric_snapshot_service::get_typing_snapshots_by_session(&conn, "session-1")
                .unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].keystrokes_count, 180);
        assert_eq!(control.get_live_metrics().unwrap().total_keystrokes, 180);

        // Disable Module::TypingAnalysis in settings: capture must stop and counters reset.
        settings_service::set_module_enabled(
            &conn,
            &auth_state,
            SetModuleEnabledPayload {
                module: Module::TypingAnalysis,
                enabled: false,
            },
        )
        .unwrap();
        control.on_module_disabled().unwrap();
        assert!(!control.is_capture_enabled());

        for sec in 0..60 {
            control.add_simulated_keystrokes(5);
            control.poll_tick(&conn, &auth_state, utc_at(1, sec)).unwrap();
        }

        let saved_after_disable =
            typing_metric_snapshot_service::get_typing_snapshots_by_session(&conn, "session-1")
                .unwrap();
        assert_eq!(saved_after_disable.len(), 1);
        let live_disabled = control.get_live_metrics().unwrap();
        assert!(!live_disabled.is_monitoring_active);
        assert_eq!(live_disabled.total_keystrokes, 0);
        assert_eq!(live_disabled.cpm, 0);

        // Re-enable module, verify capture resumes, then logout and verify total block.
        settings_service::set_module_enabled(
            &conn,
            &auth_state,
            SetModuleEnabledPayload {
                module: Module::TypingAnalysis,
                enabled: true,
            },
        )
        .unwrap();
        control.on_module_enabled().unwrap();
        assert!(control.is_capture_enabled());
        control.add_simulated_keystrokes(10);
        control.poll_tick(&conn, &auth_state, utc_at(2, 0)).unwrap();
        assert_eq!(control.get_live_metrics().unwrap().total_keystrokes, 10);

        auth_service::logout(&auth_state).unwrap();
        control.clear_all().unwrap();
        assert!(!control.is_capture_enabled());

        control.add_simulated_keystrokes(10);
        control.poll_tick(&conn, &auth_state, utc_at(2, 1)).unwrap();
        let live_logged_out = control.get_live_metrics().unwrap();
        assert_eq!(live_logged_out.session_id, None);
        assert!(!live_logged_out.is_monitoring_active);
        assert_eq!(live_logged_out.total_keystrokes, 0);
    }
}