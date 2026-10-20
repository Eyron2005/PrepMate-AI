import { useRef, useState } from "react";
import { FaDownload, FaUpload } from "react-icons/fa";
import AdminSidebar from "../components/AdminSidebar";
import { supabase } from "../services/supabase";

const tables = ["questions", "staff", "ojt_records", "system_settings"];
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

  async function createBackup() {
    setWorking(true);
    setErrorMessage("");
    setSuccessMessage("");
    const results = await Promise.all(tables.map(readTable));
    const failed = results.findIndex((result) => result.error);
    if (failed >= 0) {
      const error = results[failed].error;
      console.error(`Unable to back up ${tables[failed]}:`, error);
      setErrorMessage(`Unable to back up ${tables[failed]}: ${error.message}`);
      setWorking(false);
      return;
    }
    const backup = {
      format,
      version: 1,
      created_at: new Date().toISOString(),
      tables: Object.fromEntries(tables.map((table, index) => [table, results[index].data])),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `prepmate-admin-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setSuccessMessage("Backup downloaded. Store the file somewhere secure.");
    setWorking(false);
  }

  async function restoreBackup() {
    if (!file) return;
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch (error) {
      console.error("Invalid backup JSON:", error);
      setErrorMessage("The selected file is not valid JSON.");
      return;
    }
    if (
      backup?.format !== format ||
      backup?.version !== 1 ||
      !backup.tables ||
      tables.some((table) => !Array.isArray(backup.tables[table])) ||
      backup.tables.system_settings.length !== 1
    ) {
      setErrorMessage("This is not a valid supported PrepMate admin backup.");
      return;
    }
    if (!window.confirm("Restore this backup? Current questions, staff, OJT, and settings will be replaced. User profiles and authentication accounts are not included.")) return;

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
    setSuccessMessage(`Backup restored. Questions: ${data.questions}, staff: ${data.staff}, OJT records: ${data.ojt_records}.`);
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setWorking(false);
  }

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" /><div className="float-orb orb-two" /><div className="float-orb orb-three" />
      <AdminSidebar />
      <main className="relative ml-20 max-w-5xl px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        <section className="glass-card rounded-[2rem] border border-white/70 p-8 shadow-xl ring-1 ring-sky-100/80">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-sky-700">Administration</p><h1 className="mt-3 text-4xl font-semibold">Backup &amp; Restore</h1>
          <p className="mt-3 text-slate-600">Back up questions, staff, OJT records, and system settings. User profiles and auth accounts are excluded.</p>
        </section>
        {(errorMessage || successMessage) && <p role="status" className={`mt-6 rounded-2xl border p-4 text-sm ${errorMessage ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{errorMessage || successMessage}</p>}
        <section className="glass-card mt-6 grid gap-6 rounded-[2rem] border border-white/70 p-7 shadow-xl ring-1 ring-sky-100/80 lg:grid-cols-2">
          <div className="rounded-2xl border border-sky-100 bg-white/70 p-6"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white"><FaDownload /></div><h2 className="mt-5 text-2xl font-semibold">Create a backup</h2><p className="mt-2 text-sm leading-6 text-slate-600">Download all rows in the selected app-managed tables as JSON.</p><button type="button" disabled={working} onClick={createBackup} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"><FaDownload />{working ? "Working..." : "Download backup"}</button></div>
          <div className="rounded-2xl border border-rose-100 bg-white/70 p-6"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white"><FaUpload /></div><h2 className="mt-5 text-2xl font-semibold">Restore a backup</h2><p className="mt-2 text-sm leading-6 text-slate-600">Restoring replaces current rows and runs as one database transaction.</p><label className="mt-5 block text-sm font-medium">Backup JSON file<input ref={fileRef} type="file" accept=".json,application/json" onChange={(e) => { setFile(e.target.files?.[0] || null); setErrorMessage(""); }} className="mt-2 block w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm" /></label><button type="button" disabled={!file || working} onClick={restoreBackup} className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-600 to-orange-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"><FaUpload />{working ? "Working..." : "Restore backup"}</button></div>
        </section>
      </main>
    </div>
  );
}

export default BackupRestore;
