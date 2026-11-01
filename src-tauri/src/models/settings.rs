use serde::{Deserialize, Deserializer, Serialize};

/// Longest accepted webcam identifier; browser device IDs are much shorter.
pub const WEB_CAM_MAX_LENGTH: usize = 512;

/// Analysis modules a user can turn on or off; values match the `settings` columns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Module {
    PosturalAnalysis,
    OcularAnalysis,
    TypingAnalysis,
}

impl Module {
    pub const ALL: [Self; 3] = [
        Self::PosturalAnalysis,
        Self::OcularAnalysis,
        Self::TypingAnalysis,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::PosturalAnalysis => "postural_analysis",
            Self::OcularAnalysis => "ocular_analysis",
            Self::TypingAnalysis => "typing_analysis",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub id: i64,
    pub user_id: i64,
    pub postural_analysis: bool,
    pub ocular_analysis: bool,
    pub typing_analysis: bool,
    /// Device ID of the user's default webcam; none until one is chosen.
    pub web_cam: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Settings {
    pub fn is_module_enabled(&self, module: Module) -> bool {
        match module {
            Module::PosturalAnalysis => self.postural_analysis,
            Module::OcularAnalysis => self.ocular_analysis,
            Module::TypingAnalysis => self.typing_analysis,
        }
    }

    pub fn set_module_enabled(&mut self, module: Module, enabled: bool) {
        match module {
            Module::PosturalAnalysis => self.postural_analysis = enabled,
            Module::OcularAnalysis => self.ocular_analysis = enabled,
            Module::TypingAnalysis => self.typing_analysis = enabled,
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateSettingsPayload {
    pub postural_analysis: Option<bool>,
    pub ocular_analysis: Option<bool>,
    pub typing_analysis: Option<bool>,
    /// Absent keeps the saved webcam, `null` clears it and a string replaces it.
    #[serde(default, deserialize_with = "present")]
    pub web_cam: Option<Option<String>>,
}

/// Distinguishes an explicit `null` from an omitted field.
fn present<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<Option<String>>, D::Error> {
    Option::deserialize(deserializer).map(Some)
}

impl UpdateSettingsPayload {
    pub fn changes(&self) -> impl Iterator<Item = (Module, bool)> {
        [
            (Module::PosturalAnalysis, self.postural_analysis),
            (Module::OcularAnalysis, self.ocular_analysis),
            (Module::TypingAnalysis, self.typing_analysis),
        ]
        .into_iter()
        .filter_map(|(module, enabled)| enabled.map(|enabled| (module, enabled)))
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetModuleEnabledPayload {
    pub module: Module,
    pub enabled: bool,
}
