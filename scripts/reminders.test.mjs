import assert from "node:assert/strict";
import test from "node:test";
import { createReminderListSync } from "../src/components/Reminder/reminderListSync.ts";

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function createList() {
    const sync = createReminderListSync();
    const results = [];
    const errors = [];
    let loading = false;
    return {
        sync, results, errors,
        get loading() { return loading; },
        load(response) {
            loading = true;
            return sync.load(() => response, {
                onSuccess: (reminders) => results.push(reminders),
                onError: (error) => errors.push(error),
                onSettled: () => { loading = false; },
            });
        },
    };
}

test("a read started before a status change cannot overwrite its saved result", async () => {
    const list = createList();
    const oldRead = deferred();
    const loading = list.load(oldRead.promise);
    list.sync.beginStatusChange("visual-break", "ativo");
    list.sync.finishStatusChange("visual-break");
    oldRead.resolve([{ id: "visual-break", status: "inativo" }]);
    await loading;
    assert.deepEqual(list.results, []);
    assert.equal(list.loading, false);
});

test("a read during a save preserves the optimistic status and refreshes dispatch metadata", async () => {
    const list = createList();
    list.sync.beginStatusChange("visual-break", "ativo");
    await list.load(Promise.resolve([
        { id: "visual-break", status: "inativo", lastSentAt: "2026-10-23T12:00:00Z" },
    ]));
    assert.deepEqual(list.results, [[
        { id: "visual-break", status: "ativo", lastSentAt: "2026-10-23T12:00:00Z" },
    ]]);
});

test("a read started during a save is discarded when it arrives after the save finishes", async () => {
    const list = createList();
    list.sync.beginStatusChange("visual-break", "ativo");
    const oldRead = deferred();
    const loading = list.load(oldRead.promise);
    list.sync.finishStatusChange("visual-break");
    oldRead.resolve([{ id: "visual-break", status: "inativo" }]);
    await loading;
    assert.deepEqual(list.results, []);
});

test("an outdated read failure cannot replace a status save error", async () => {
    const list = createList();
    list.sync.beginStatusChange("visual-break", "ativo");
    const oldRead = deferred();
    const loading = list.load(oldRead.promise);
    list.errors.push("Save failed");
    list.sync.finishStatusChange("visual-break");
    oldRead.reject("Old read failed");
    await loading;
    assert.deepEqual(list.errors, ["Save failed"]);
});

test("overlapping reads keep the latest result and loading indicator", async () => {
    const list = createList();
    const first = deferred();
    const second = deferred();
    const firstLoading = list.load(first.promise);
    const secondLoading = list.load(second.promise);
    first.resolve([{ id: "visual-break", status: "inativo" }]);
    await firstLoading;
    assert.equal(list.loading, true);
    assert.deepEqual(list.results, []);
    second.resolve([{ id: "visual-break", status: "ativo" }]);
    await secondLoading;
    assert.equal(list.loading, false);

    const third = deferred();
    const thirdLoading = list.load(third.promise);
    await list.load(Promise.resolve([{ id: "visual-break", status: "inativo" }]));
    third.resolve([{ id: "visual-break", status: "ativo" }]);
    await thirdLoading;
    assert.deepEqual(list.results, [
        [{ id: "visual-break", status: "ativo" }],
        [{ id: "visual-break", status: "inativo" }],
    ]);
});

test("pending changes are isolated by reminder and duplicate submissions are blocked", async () => {
    const list = createList();
    assert.equal(list.sync.beginStatusChange("visual-break", "ativo"), true);
    assert.equal(list.sync.beginStatusChange("visual-break", "inativo"), false);
    assert.equal(list.sync.beginStatusChange("movement-break", "inativo"), true);
    list.sync.finishStatusChange("visual-break");
    await list.load(Promise.resolve([
        { id: "visual-break", status: "ativo" },
        { id: "movement-break", status: "ativo" },
        { id: "custom", status: "ativo" },
    ]));
    assert.deepEqual(list.results[0].map(({ status }) => status), ["ativo", "inativo", "ativo"]);
    assert.equal(list.sync.beginStatusChange("visual-break", "inativo"), true);
});

test("saving or deleting a reminder invalidates earlier reads and allows fresh ones", async () => {
    const list = createList();
    const oldRead = deferred();
    const loading = list.load(oldRead.promise);
    list.sync.invalidateLoads();
    await list.load(Promise.resolve([{ id: "new", status: "ativo" }]));
    oldRead.resolve([{ id: "deleted", status: "ativo" }]);
    await loading;
    assert.deepEqual(list.results, [[{ id: "new", status: "ativo" }]]);
});

test("a current read failure still reports the error and ends loading", async () => {
    const list = createList();
    await list.load(Promise.reject("Read failed"));
    assert.deepEqual(list.errors, ["Read failed"]);
    assert.equal(list.loading, false);
});
