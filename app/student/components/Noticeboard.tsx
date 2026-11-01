"use client";
import { signOut } from "next-auth/react";
import { getSession } from "@/lib/client-session";


import React, { useEffect, useState } from "react";
import { Megaphone, Clock, UserCircle, Image as ImageIcon, FileText, Link as LinkIcon, ExternalLink, Pin, AlertCircle, ListChecks } from "lucide-react";
import { supabase } from "@/app/student/supabase";
import { fetchStudentByUid } from "@/app/actions/reads";
import { submitRsvp } from "@/app/actions/broadcasts";

export default function Noticeboard() {
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [rsvps, setRsvps] = useState<Record<string, string>>({});
  const [voting, setVoting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  const fetchBroadcasts = async () => {
    try {
      const uid = ((await getSession())?.user as any)?.uid;
      if (!uid) return;

      // 1. Fetch student's department_id
      const { data: student, error: studentError } = await fetchStudentByUid(uid);

      if (studentError) throw new Error(studentError);

      if (student) {
        // Guard against missing department IDs
        if (!student.department_id) {
          console.warn("Noticeboard: Student has no department_id assigned.");
          setLoading(false);
          return;
        }

        // 2. Fetch broadcasts meant for this department's students
        const now = new Date().toISOString();
        const { data: notices, error: noticesError } = await supabase
          .from("broadcasts")
          .select("*")
          .eq("department_id", student.department_id)
          .in("target_audience", ["all", "students"])
          .or(`expires_at.is.null,expires_at.gt.${now}`)
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(20);

        if (noticesError) throw noticesError;

        if (notices) {
          setBroadcasts(notices);

          // 3. Fetch user's RSVPs for these notices
          const rsvpNoticeIds = notices.filter((n: any) => n.has_rsvp).map((n: any) => n.id);
          if (rsvpNoticeIds.length > 0) {
             const { data: userRsvps } = await supabase
               .from("broadcast_rsvps")
               .select("broadcast_id, response")
               .eq("user_id", uid)
               .in("broadcast_id", rsvpNoticeIds);

             if (userRsvps) {
               const rsvpMap: Record<string, string> = {};
               userRsvps.forEach((r: any) => {
                 rsvpMap[r.broadcast_id] = r.response;
               });
               setRsvps(rsvpMap);
             }
          }
        }
      }
    } catch (error: any) {
      console.error("Error fetching broadcasts:", error.message || error);
    } finally {
      setLoading(false);
    }
  };

  const handleRsvp = async (broadcastId: string, option: string) => {
    try {
      setVoting(true);
      const uid = ((await getSession())?.user as any)?.uid;
      if (!uid) return;

      await submitRsvp(broadcastId, option);

      setRsvps(prev => ({ ...prev, [broadcastId]: option }));
    } catch (err: any) {
      console.error("RSVP error:", err);
      alert("Could not submit response. Please try again.");
    } finally {
      setVoting(false);
    }
  };

  if (loading) {
    return <div className="bg-[#FFFFFF] h-64 rounded-lg border border-slate-200"></div>;
  }

  return (
    <div className="bg-[#FFFFFF] p-6 md:p-8 rounded-lg border border-slate-200 flex flex-col max-h-[500px]">
      <h3 className="text-xl font-bold text-slate-700 mb-6 flex items-center gap-3">
        <Megaphone className="text-[#17685E]" size={24} />
        Noticeboard
      </h3>

      {broadcasts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500 font-medium p-6 text-center border border-slate-200 rounded-lg">
          No new notices from your department.
        </div>
      ) : (
        <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
          {broadcasts.map((b) => (
            <div key={b.id} className={`p-5 bg-[#FFFFFF] rounded-lg flex flex-col gap-2 relative overflow-hidden ${
               b.urgency === 'urgent' ? 'border border-red-400 border border-slate-200' :
               b.urgency === 'important' ? 'border border-amber-400 border border-slate-200' :
               'border border-slate-200'
            }`}>

              {b.urgency === 'urgent' && <div className="absolute top-0 left-0 w-1 h-full bg-red-500 "></div>}
              {b.urgency === 'important' && <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>}

              <div className="flex justify-between items-start gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {b.is_pinned && <span className="bg-amber-100 text-amber-700 text-xs font-bold normal-case px-2 py-0.5 rounded flex items-center gap-1"><Pin size={10}/> Pinned</span>}
                    {b.urgency === 'urgent' && <span className="bg-red-100 text-red-700 text-xs font-bold normal-case px-2 py-0.5 rounded flex items-center gap-1 "><AlertCircle size={10}/> URGENT</span>}
                    {b.has_rsvp && <span className="bg-[#17685E]/10 text-[#17685E] text-xs font-bold normal-case px-2 py-0.5 rounded flex items-center gap-1"><ListChecks size={10}/> Quick Poll</span>}
                  </div>
                  <h4 className="text-md font-bold text-slate-800">{b.title}</h4>
                </div>
                <span className="text-xs font-bold text-slate-500 tracking-normal flex items-center gap-1 shrink-0 bg-slate-200/50 px-2 py-1 rounded-full"><Clock size={10} /> {new Date(b.created_at).toLocaleDateString()}</span>
              </div>

              <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{b.message}</p>

              {/* RSVP Poll Section */}
              {b.has_rsvp && b.rsvp_options && (
                <div className="mt-3 p-4 bg-white/60 rounded-lg border border-slate-200">
                   <p className="text-xs font-bold text-slate-500 mb-3">{rsvps[b.id] ? "Your Response:" : "Poll: Please select an option"}</p>
                   <div className="flex flex-wrap gap-2">
                     {b.rsvp_options.map((opt: string, i: number) => {
                        const isSelected = rsvps[b.id] === opt;
                        return (
                          <button
                            key={i}
                            disabled={voting}
                            onClick={() => handleRsvp(b.id, opt)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all  ${
                              isSelected
                                ? 'bg-[#17685E] text-white  border border-slate-200'
                                : 'bg-[#FFFFFF] text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}
                          >
                            {opt} {isSelected && "✓"}
                          </button>
                        );
                     })}
                   </div>
                </div>
              )}

              {/* Attachments Section */}
              {b.attachments && Array.isArray(b.attachments) && b.attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {b.attachments.map((att: any, idx: number) => {
                    if (att.type === 'image') {
                      return (
                        <a key={idx} href={att.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 bg-white/70 hover:bg-white text-emerald-600 text-xs font-bold rounded-lg  transition-colors border border-emerald-100">
                          <ImageIcon size={14} /> View Image
                        </a>
                      );
                    } else if (att.type === 'pdf') {
                      return (
                        <a key={idx} href={att.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 bg-white/70 hover:bg-white text-rose-500 text-xs font-bold rounded-lg  transition-colors border border-rose-100">
                          <FileText size={14} /> Open PDF
                        </a>
                      );
                    } else if (att.type === 'link') {
                      return (
                        <a key={idx} href={att.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 bg-white/70 hover:bg-white text-blue-500 text-xs font-bold rounded-lg  transition-colors border border-blue-100">
                          <LinkIcon size={14} /> External Link
                        </a>
                      );
                    }
                    return null;
                  })}
                </div>
              )}

              <div className="mt-2 pt-3 border-t border-slate-200/50 flex items-center gap-1 text-xs normal-case tracking-normal text-[#17685E] font-bold"><UserCircle size={14} /> Sent by {b.created_by}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
