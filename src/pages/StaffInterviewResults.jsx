import { useEffect, useMemo, useState } from "react";
import { FaSearch } from "react-icons/fa";
import StaffSidebar from "../components/StaffSidebar";
import AdminSidebar from "../components/AdminSidebar";
import { supabase } from "../services/supabase";

function StaffInterviewResults({ isAdmin = false }) {
  const [sessions, setSessions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [studentsById, setStudentsById] = useState({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadResults() {
      const [
        { data: sessionRows, error: sessionError },
        { data: answerRows, error: answerError },
        { data: profiles, error: profileError },
      ] =
        await Promise.all([
          supabase.from("interview_sessions").select("*").order("created_at", { ascending: false }),
          supabase.from("interview_results").select("id, profile_id, session_id, user_transcript, ai_score, ai_feedback, created_at").order("created_at", { ascending: false }),
          supabase.from("profiles").select("id, auth_user_id, full_name"),
        ]);

      if (!active) return;
      if (sessionError || answerError || profileError) {
        const error = sessionError || answerError || profileError;
        console.error("Unable to load interview results:", error);
        setErrorMessage(`Unable to load interview results: ${error.message}`);
      } else {
        const names = {};
        (profiles || []).forEach((profile) => {
          const name = profile.full_name || "Unnamed student";
          names[profile.id] = name;
          if (profile.auth_user_id) names[profile.auth_user_id] = name;
        });
        setStudentsById(names);
        setSessions(sessionRows || []);
        setAnswers(answerRows || []);
      }
      setLoading(false);
    }

    loadResults();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) =>
      [studentsById[session.profile_id], session.summary]
        .some((value) => value?.toLowerCase().includes(query))
    );
  }, [search, sessions, studentsById]);
  const filteredAnswers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return answers;
    return answers.filter((answer) =>
      [studentsById[answer.profile_id], answer.user_transcript, answer.ai_feedback]
        .some((value) => value?.toLowerCase().includes(query))
    );
  }, [answers, search, studentsById]);

  return (
    <div className="page-shell min-h-screen text-slate-900">
      <div className="float-orb orb-one" /><div className="float-orb orb-two" /><div className="float-orb orb-three" />
      {isAdmin ? <AdminSidebar /> : <StaffSidebar />}
      <main className="relative ml-20 flex max-w-7xl flex-col gap-6 px-4 py-8 md:ml-64 md:px-8">
        <section className="glass-card rounded-[2rem] border border-white/70 p-8 shadow-xl ring-1 ring-sky-100/80">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-sky-700">{isAdmin ? "Administration" : "Staff Workspace"}</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">Interview Results</h1>
          <p className="mt-3 text-slate-600">{isAdmin ? "Review interview results and responses across all students." : "View interview results for students assigned to you."}</p>
        </section>

        {errorMessage && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{errorMessage}</p>}

        <section className="glass-card overflow-hidden rounded-[2rem] border border-white/70 shadow-xl ring-1 ring-sky-100/80">
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Interview sessions</h2>
              <p className="mt-1 text-sm text-slate-500">{filtered.length} {isAdmin ? "results" : "assigned results"}</p>
            </div>
            <div className="relative w-full sm:max-w-sm">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pl-11 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="Search results..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {["Student", "Interview date", "Overall score", "Speech score", "Camera score", "Summary"].map((heading) => (
                    <th key={heading} className="px-5 py-4">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-500">Loading interview results...</td></tr>
                ) : errorMessage ? null : filtered.length === 0 ? (
                  <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-500">{isAdmin ? "No interview results found." : "No interview results for your assigned students."}</td></tr>
                ) : filtered.map((session) => (
                  <tr key={session.id} className="hover:bg-sky-50/50">
                    <td className="px-5 py-4 font-semibold">{studentsById[session.profile_id] || "Assigned student"}</td>
                    <td className="px-5 py-4">{session.created_at ? new Date(session.created_at).toLocaleString() : "—"}</td>
                    <td className="px-5 py-4">{session.overall_score ?? "—"}</td>
                    <td className="px-5 py-4">{session.speech_score ?? "—"}</td>
                    <td className="px-5 py-4">{session.camera_score ?? "—"}</td>
                    <td className="max-w-sm px-5 py-4">{session.summary || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass-card overflow-hidden rounded-[2rem] border border-white/70 shadow-xl ring-1 ring-sky-100/80">
          <div className="p-6">
            <h2 className="text-2xl font-semibold">Interview answers and feedback</h2>
            <p className="mt-1 text-sm text-slate-500">{filteredAnswers.length} {isAdmin ? "responses" : "assigned responses"}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {["Student", "Date", "Score", "Transcript", "Feedback"].map((heading) => (
                    <th key={heading} className="px-5 py-4">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan="5" className="px-5 py-12 text-center text-slate-500">Loading interview responses...</td></tr>
                ) : errorMessage ? null : filteredAnswers.length === 0 ? (
                  <tr><td colSpan="5" className="px-5 py-12 text-center text-slate-500">{isAdmin ? "No interview responses found." : "No interview responses for your assigned students."}</td></tr>
                ) : filteredAnswers.map((answer) => (
                  <tr key={answer.id} className="align-top hover:bg-sky-50/50">
                    <td className="px-5 py-4 font-semibold">{studentsById[answer.profile_id] || "Assigned student"}</td>
                    <td className="px-5 py-4">{answer.created_at ? new Date(answer.created_at).toLocaleString() : "—"}</td>
                    <td className="px-5 py-4">{answer.ai_score ?? "—"}</td>
                    <td className="max-w-sm whitespace-pre-wrap px-5 py-4">{answer.user_transcript || "—"}</td>
                    <td className="max-w-sm whitespace-pre-wrap px-5 py-4">{answer.ai_feedback || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default StaffInterviewResults;
