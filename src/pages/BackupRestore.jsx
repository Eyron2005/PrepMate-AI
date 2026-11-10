import { useRef, useState } from "react";
import { FaDownload, FaUpload, FaDatabase, FaFileCode, FaCheck, FaExclamationTriangle } from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import { supabase } from "../services/supabase";

const backupOptions = [
  { key: "profiles", label: "User Profiles & Accounts", desc: "Candidate metadata and registration records" },
  { key: "questions", label: "Question Bank", desc: "Curated technical, behavioral, and HR questions" },
  { key: "interview_results", label: "Interview Results & Transcripts", desc: "Evaluation metrics, AI feedback, and answers" },
  { key: "staff", label: "Staff Accounts", desc: "Supervisor credentials and department assignments" },
];
const format = "prepmate-admin-backup";
const pageSize = 500;

async function readTable(table) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from(table).select("*").range(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
}

function BackupRestore() {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [working, setWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedTables, setSelectedTables] = useState(
    Object.fromEntries(backupOptions.map(({ key }) => [key, true]))
  );

  function toggleTable(key) {
    setSelectedTables((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function selectAll() {
    setSelectedTables(Object.fromEntries(backupOptions.map(({ key }) => [key, true])));
  }

  function deselectAll() {
    setSelectedTables(Object.fromEntries(backupOptions.map(({ key }) => [key, false])));
  }

  async function createBackup() {
    const chosenTables = backupOptions
      .filter(({ key }) => selectedTables[key])
      .map(({ key }) => key);

    if (chosenTables.length === 0) {
      setErrorMessage("Select at least one backup option before downloading.");
      return;
    }

    setWorking(true);
    setErrorMessage("");
    setSuccessMessage("");

    const results = await Promise.all(chosenTables.map(readTable));
    const failedIndex = results.findIndex((result) => result.error);
    if (failedIndex >= 0) {
      const error = results[failedIndex].error;
      const failedTable = chosenTables[failedIndex];
      console.error(`Unable to back up ${failedTable}:`, error);
      setErrorMessage(`Unable to back up ${failedTable}: ${error.message}`);
      setWorking(false);
      return;
    }

    const backup = {
      format,
      version: 1,
      created_at: new Date().toISOString(),
      tables: Object.fromEntries(chosenTables.map((table, index) => [table, results[index].data])),
    };

    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `prepmate-admin-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setSuccessMessage("Backup downloaded successfully. Keep the JSON snapshot safe.");
    setWorking(false);
  }

  async function restoreBackup() {
    if (!file) return;

    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch (error) {
      console.error("Invalid backup JSON:", error);
      setErrorMessage("The selected file is not a valid JSON document.");
      return;
    }

    if (
      backup?.format !== format ||
      backup?.version !== 1 ||
      !backup.tables ||
      Object.keys(backup.tables).length === 0
    ) {
      setErrorMessage("This file is not a recognized Prepmate AI admin backup.");
      return;
    }

    const invalidTable = Object.entries(backup.tables).find(([, rows]) => !Array.isArray(rows));
    if (invalidTable) {
      setErrorMessage(`Backup table "${invalidTable[0]}" contains corrupt or non-array data.`);
      return;
    }

    if (!window.confirm("Restore this backup? Existing records in matching tables will be overwritten. Authentication logins are preserved.")) return;

    setWorking(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase.rpc("restore_admin_backup", { p_backup: backup });
    if (error) {
      console.error("Unable to restore backup:", error);
      setErrorMessage(`Unable to restore backup: ${error.message}`);
      setWorking(false);
      return;
    }

    const summary = [
      data?.profiles !== undefined ? `profiles: ${data.profiles}` : null,
      data?.questions !== undefined ? `questions: ${data.questions}` : null,
      data?.interview_results !== undefined ? `interview results: ${data.interview_results}` : null,
      data?.staff !== undefined ? `staff: ${data.staff}` : null,
    ].filter(Boolean).join(", ");

    setSuccessMessage(`Database snapshot restored successfully. ${summary}.`);
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setWorking(false);
  }

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />

      <AdminSidebar />

      <main className="relative ml-20 max-w-6xl px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        {/* Banner Hero */}
        <section className="glass-card-elevated relative overflow-hidden rounded-[2.25rem] border border-white/80 p-7 shadow-[0_25px_60px_-25px_rgba(14,116,144,0.35)] ring-1 ring-sky-100/90 fade-in-up sm:p-9">
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-emerald-400/15 via-teal-400/12 to-cyan-400/10" />

          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-100 to-teal-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-emerald-800 shadow-sm">
              <FaDatabase className="text-emerald-600 text-[11px]" />
              Data Security &amp; Continuity
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
              Backup &amp; Restore
            </h1>
            <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
              Export encrypted application data snapshots or restore previous backups with atomic verification.
            </p>
          </div>
        </section>

        {/* Notifications */}
        {(errorMessage || successMessage) && (
          <div
            role="status"
            className={`mt-6 flex items-center gap-3 rounded-2xl border p-4 text-xs font-bold shadow-sm ${
              errorMessage
                ? "border-rose-200 bg-rose-50/90 text-rose-800"
                : "border-emerald-200 bg-emerald-50/90 text-emerald-800"
            }`}
          >
            {errorMessage ? <FaExclamationTriangle className="text-sm shrink-0" /> : <FaCheck className="text-sm shrink-0" />}
            <span>{errorMessage || successMessage}</span>
          </div>
        )}

        {/* Action Panels */}
        <section className="mt-8 grid gap-7 lg:grid-cols-2">
          {/* Create Backup */}
          <div className="glass-card flex flex-col justify-between rounded-[2.25rem] border border-white/80 p-7 shadow-[0_20px_45px_-25px_rgba(37,99,235,0.4)] ring-1 ring-sky-100/90 sm:p-8">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-lg text-white shadow-md shadow-sky-500/30">
                  <FaDownload />
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-[11px] font-bold text-sky-700 hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-[11px] font-bold text-slate-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <h2 className="mt-5 text-xl font-bold text-slate-950">Export System Snapshot</h2>
              <p className="mt-1.5 text-xs text-slate-600">Choose tables to bundle into a timestamped JSON backup archive.</p>

              <div className="mt-5 space-y-2.5">
                {backupOptions.map(({ key, label, desc }) => {
                  const isChecked = !!selectedTables[key];
                  return (
                    <label
                      key={key}
                      className={`flex cursor-pointer items-center justify-between rounded-2xl border p-3.5 transition-all ${
                        isChecked
                          ? "border-sky-300 bg-sky-50/70 shadow-sm ring-1 ring-sky-200/50"
                          : "border-slate-200/80 bg-white/70 hover:bg-slate-50"
                      }`}
                    >
                      <div className="min-w-0 pr-3">
                        <p className="text-xs font-bold text-slate-900">{label}</p>
                        <p className="text-[11px] text-slate-500">{desc}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTable(key)}
                        className="h-4 w-4 rounded accent-sky-600"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              disabled={working}
              onClick={createBackup}
              className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 py-3.5 text-xs font-bold text-white shadow-md shadow-sky-500/30 transition hover:shadow-sky-500/50 disabled:opacity-60"
            >
              <FaDownload className="text-xs" />
              <span>{working ? "Bundling Database..." : "Download JSON Snapshot"}</span>
            </button>
          </div>

          {/* Restore Backup */}
          <div className="glass-card flex flex-col justify-between rounded-[2.25rem] border border-white/80 p-7 shadow-[0_20px_45px_-25px_rgba(245,158,11,0.3)] ring-1 ring-amber-100/90 sm:p-8">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-lg text-white shadow-md shadow-amber-500/30">
                  <FaUpload />
                </span>
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200">
                  Cautionary Action
                </span>
              </div>

              <h2 className="mt-5 text-xl font-bold text-slate-950">Restore from File</h2>
              <p className="mt-1.5 text-xs text-slate-600">
                Overwrites table data with contents from an existing backup snapshot.
              </p>

              {/* File Dropzone */}
              <div className="mt-5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-6 text-center transition hover:border-amber-300 hover:bg-amber-50/30">
                <FaFileCode className="mx-auto mb-2 text-2xl text-slate-400" />
                <p className="text-xs font-bold text-slate-700">Select Backup Archive</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Only .json files created by Prepmate are supported</p>

                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null);
                    setErrorMessage("");
                  }}
                  className="mt-4 block w-full text-xs text-slate-500 file:mr-3 file:rounded-xl file:border-0 file:bg-amber-100 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-amber-800 hover:file:bg-amber-200"
                />

                {file && (
                  <p className="mt-3 truncate rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    Ready to restore: {file.name}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={!file || working}
              onClick={restoreBackup}
              className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 py-3.5 text-xs font-bold text-white shadow-md shadow-orange-600/30 transition hover:shadow-orange-600/50 disabled:opacity-50"
            >
              <FaUpload className="text-xs" />
              <span>{working ? "Restoring Database..." : "Execute Database Restore"}</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default BackupRestore;
