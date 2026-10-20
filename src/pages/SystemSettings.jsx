import { useEffect, useState } from "react";
import AdminSidebar from "../components/AdminSidebar";
import { supabase } from "../services/supabase";

const defaults = {
  organization_name: "Prepmate AI",
  support_email: "",
  default_ojt_duration_days: 90,
  allow_new_registrations: true,
};
const inputClass = "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

function SystemSettings() {
  const [settings, setSettings] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function loadSettings() {
      const { data, error } = await supabase.from("system_settings").select("*").eq("id", 1).maybeSingle();
      if (error) {
        console.error("Unable to load settings:", error);
        setErrorMessage(`Unable to load settings: ${error.message}`);
      } else if (data) {
        setSettings({
          organization_name: data.organization_name || defaults.organization_name,
          support_email: data.support_email || "",
          default_ojt_duration_days: data.default_ojt_duration_days || 90,
          allow_new_registrations: data.allow_new_registrations ?? true,
        });
      }
      setLoading(false);
    }
    loadSettings();
  }, []);

  async function saveSettings(event) {
    event.preventDefault();
    const duration = Number(settings.default_ojt_duration_days);
    if (!Number.isInteger(duration) || duration < 1 || duration > 3650) {
      setErrorMessage("OJT duration must be a whole number from 1 to 3650.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    const { error } = await supabase.from("system_settings").upsert({
      id: 1,
      organization_name: settings.organization_name.trim(),
      support_email: settings.support_email.trim(),
      default_ojt_duration_days: duration,
      allow_new_registrations: settings.allow_new_registrations,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error("Unable to save settings:", error);
      setErrorMessage(`Unable to save settings: ${error.message}`);
    } else {
      setSuccessMessage("System settings saved.");
    }
    setSaving(false);
  }

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" /><div className="float-orb orb-two" /><div className="float-orb orb-three" />
      <AdminSidebar />
      <main className="relative ml-20 max-w-4xl px-4 py-8 md:ml-64 md:px-8 lg:py-10">
        <section className="glass-card rounded-[2rem] border border-white/70 p-8 shadow-xl ring-1 ring-sky-100/80">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-sky-700">Administration</p><h1 className="mt-3 text-4xl font-semibold">System Settings</h1>
          <p className="mt-3 text-slate-600">Manage organization details and application defaults.</p>
        </section>
        {(errorMessage || successMessage) && <p role="status" className={`mt-6 rounded-2xl border p-4 text-sm ${errorMessage ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{errorMessage || successMessage}</p>}
        <form onSubmit={saveSettings} className="glass-card mt-6 space-y-6 rounded-[2rem] border border-white/70 p-8 shadow-xl ring-1 ring-sky-100/80">
          <label className="block text-sm font-medium">Organization name<input required disabled={loading} className={`${inputClass} mt-2`} value={settings.organization_name} onChange={(e) => setSettings({ ...settings, organization_name: e.target.value })} /></label>
          <label className="block text-sm font-medium">Support email<input type="email" disabled={loading} className={`${inputClass} mt-2`} value={settings.support_email} onChange={(e) => setSettings({ ...settings, support_email: e.target.value })} /></label>
          <label className="block text-sm font-medium">Default OJT duration (days)<input type="number" min="1" max="3650" step="1" required disabled={loading} className={`${inputClass} mt-2 max-w-xs`} value={settings.default_ojt_duration_days} onChange={(e) => setSettings({ ...settings, default_ojt_duration_days: e.target.value })} /></label>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4"><input type="checkbox" className="mt-1 h-4 w-4 accent-sky-600" disabled={loading} checked={settings.allow_new_registrations} onChange={(e) => setSettings({ ...settings, allow_new_registrations: e.target.checked })} /><span><span className="block font-semibold">Allow new registrations</span><span className="mt-1 block text-xs text-slate-500">Save the registration setting for the connected application.</span></span></label>
          <button disabled={loading || saving} className="rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-lg disabled:opacity-60">{loading ? "Loading..." : saving ? "Saving..." : "Save settings"}</button>
        </form>
      </main>
    </div>
  );
}

export default SystemSettings;
