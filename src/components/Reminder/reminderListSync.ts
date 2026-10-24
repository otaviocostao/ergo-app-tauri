import type { ReminderItem } from "../../services/reminderService";

interface ReminderLoadCallbacks {
    onSuccess: (reminders: ReminderItem[]) => void;
    onError: (error: unknown) => void;
    onSettled: () => void;
}

export function createReminderListSync() {
    let latestRequestId = 0;
    let revision = 0;
    const pendingStatuses = new Map<string, string>();

    return {
        async load(fetchReminders: () => Promise<ReminderItem[]>, callbacks: ReminderLoadCallbacks): Promise<void> {
            const requestId = ++latestRequestId;
            const loadRevision = revision;
            // A newer read or a local change makes this response obsolete.
            const isCurrent = () => requestId === latestRequestId && loadRevision === revision;
            try {
                const reminders = await fetchReminders();
                if (!isCurrent()) return;
                // Reads during a save must preserve the requested switch state.
                callbacks.onSuccess(reminders.map((reminder) => {
                    const status = pendingStatuses.get(reminder.id);
                    return status === undefined ? reminder : { ...reminder, status };
                }));
            } catch (error) {
                if (isCurrent()) callbacks.onError(error);
            } finally {
                if (requestId === latestRequestId) callbacks.onSettled();
            }
        },
        invalidateLoads(): void {
            revision++;
        },
        beginStatusChange(id: string, status: string): boolean {
            if (pendingStatuses.has(id)) return false;
            revision++;
            pendingStatuses.set(id, status);
            return true;
        },
        finishStatusChange(id: string): void {
            // Discard reads taken during persistence, including failed saves.
            revision++;
            pendingStatuses.delete(id);
        },
    };
}
