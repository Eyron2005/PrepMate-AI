import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";

const inputClass = "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

const invitationMessages = {
  invalid: "This invitation link is invalid or no longer available.",
  expired: "This staff invitation has expired. Ask an administrator to send a new invitation.",
  revoked: "This staff invitation was revoked. Ask an administrator to send a new invitation.",
  accepted: "This staff invitation has already been accepted. Sign in to continue.",
  email_mismatch: "The signed-in email does not match the invited email address. Sign out and open the invitation link using the invited account.",
  email_unverified: "Verify the invited email address using the invitation link before setting a password.",
};

function AcceptStaffInvitation() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadInvitation() {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error) {
        console.error("Unable to load the staff invitation session:", error);
        setErrorMessage("Unable to verify the invitation link. Please reopen it or contact an administrator.");
        setLoading(false);
        return;
      }

      if (!data.session?.user) {
        setErrorMessage("This invitation link is invalid, expired, or has not been verified. Open the latest staff invitation email to continue.");
        setLoading(false);
        return;
      }

      setUser(data.session.user);
      const { data: invitationData, error: invitationError } = await supabase.rpc("get_staff_invitation_status");
      if (!active) return;

      if (invitationError) {
        console.error("Unable to validate the staff invitation:", invitationError);
        setErrorMessage("Unable to validate this staff invitation. Please try again or contact an administrator.");
      } else if (invitationData?.status === "pending") {
        setInvitation(invitationData);
      } else {
        setErrorMessage(
          invitationMessages[invitationData?.status] || "This staff invitation is not available.",
        );
      }
      setLoading(false);
    }

    loadInvitation();
    return () => {
      active = false;
    };
  }, []);

  async function acceptInvitation(event) {
    event.preventDefault();
    setErrorMessage("");

    if (password.length < 8) {
      setErrorMessage("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { data: updatedUser, error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;
      if (!updatedUser.user) throw new Error("Unable to confirm the invited account.");

      const { error: acceptanceError } = await supabase.functions.invoke("accept-staff-invitation", {
        body: {},
      });
      if (acceptanceError) {
        const response = acceptanceError.context;
        if (response instanceof Response) {
          const details = await response.json();
          throw new Error(details.error || acceptanceError.message);
        }
        throw acceptanceError;
      }

      navigate("/staff-dashboard", { replace: true });
    } catch (error) {
      console.error("Unable to accept staff invitation:", error);
      setErrorMessage(error instanceof Error ? error.message : "Unable to accept the staff invitation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 text-slate-900">
      <div className="float-orb orb-one" />
      <div className="float-orb orb-two" />
      <div className="float-orb orb-three" />
      <section className="glass-card relative w-full max-w-lg rounded-[2rem] border border-white/70 p-8 shadow-xl ring-1 ring-sky-100/80">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-sky-700">Prepmate Staff</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Accept your invitation</h1>

        {loading ? (
          <p className="mt-5 text-sm text-slate-600">Verifying your invitation link...</p>
        ) : !user || !invitation ? (
          <>
            <p role="alert" className="mt-5 text-sm text-slate-600">{errorMessage}</p>
            <Link to="/" className="mt-6 inline-flex rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white">
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-slate-600">
              {invitation.full_name ? `Hello ${invitation.full_name}, ` : "Hello, "}
              you have been invited to join Prepmate as a staff member. Confirm your account by choosing a password.
            </p>
            <p className="mt-2 text-sm font-medium text-slate-700">{invitation.email}</p>
            {errorMessage && (
              <p role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {errorMessage}
              </p>
            )}
            <form onSubmit={acceptInvitation} className="mt-6 space-y-4">
              <label className="block text-sm font-medium">
                Create password
                <input
                  className={`${inputClass} mt-2`}
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                Confirm password
                <input
                  className={`${inputClass} mt-2`}
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
              <button
                disabled={saving}
                className="w-full rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Accepting invitation..." : "Set password and accept invitation"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

export default AcceptStaffInvitation;
