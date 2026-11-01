"use client";
import { signOut } from "next-auth/react";
import { getSession } from "@/lib/client-session";


import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, Clock, MapPin, Calendar, FileText, UserCircle, Send, MessageSquare } from "lucide-react";
import { supabase } from "@/app/student/supabase";
import { startActivityRefresh } from "@/lib/activity-refresh";
import { approveStudentActivity } from "@/app/actions/activities";
import { fetchStudentsByUids } from "@/app/actions/reads";

type RequestItem = {
  reactKey: string;
  id: string | number;
  pkColumn: "activity_id" | "id";
  isNewArchitecture?: boolean;
  uid: string;
  studentName: string;
  title: string;
  type: string;
  date: string;
  location: string;
  desc: string;
  status: string;
  proofLink?: string | null;
};

export default function PriorityQueuePage() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [feedbacks, setFeedbacks] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPendingRequests() {
      const suid = ((await getSession())?.user as any)?.uid;
      if (!suid) return;

      // Fetch Old and New Activities concurrently
      const [oldActivitiesRes, newActivitiesDataRes] = await Promise.all([
        supabase
          .from("student_activities")
          .select("*")
          .eq("suid", suid)
          .in("status", ["Pending", "Proof Submitted"]),
        supabase
          .from("activity_mentors")
          .select(`
            group_activities (
              id, title, category, start_date, end_date, location, leave_required, description, created_at, proof_link,
              activity_participants ( student_uid, status )
            )
          `)
          .eq("staff_suid", suid)
      ]);

      const oldActivities = oldActivitiesRes.data;
      const newActivitiesData = newActivitiesDataRes.data;

      const newActivities: any[] = [];
      newActivitiesData?.forEach((ma: any) => {
        const act = ma.group_activities;
        if (act && act.activity_participants) {
          act.activity_participants.forEach((ap: any) => {
            if (ap.status === "Pending" || ap.status === "Proof Submitted") {
              newActivities.push({
                isNewArchitecture: true,
                id: act.id,
                uid: ap.student_uid,
                activity_name: act.title,
                type: act.category,
                from_date: act.start_date,
                to_date: act.end_date,
                leave_required: act.leave_required,
                desc: act.description,
                location: act.location,
                created_at: act.created_at,
                status: ap.status,
                proof_link: act.proof_link
              });
            }
          });
        }
      });

      // Combine and sort by oldest first
      const combinedActivities = [...(oldActivities || []), ...newActivities].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      if (combinedActivities.length > 0) {
        // Fetch student names for the UIDs
        const uids = [...new Set(combinedActivities.map((a: any) => a.uid))];
        const { data: students } = await fetchStudentsByUids(uids);

        // Create a quick lookup dictionary for student names
        const studentMap = (students || []).reduce((acc: any, curr: any) => {
          acc[curr.uid] = curr.name;
          return acc;
        }, {});

        // Map the data to match our UI
        const mapped: RequestItem[] = combinedActivities.map((act: any) => {
          const isNew = !!act.isNewArchitecture;
          const baseId = isNew ? act.id : (act.activity_id || act.id);
          // Create a unique compound key for group activities since multiple students can have pending requests for the same event!
          const reactKey = isNew ? `${baseId}-${act.uid}` : String(baseId);

          let pLink = act.proof_link;
          if (!isNew && act.feedback && act.feedback.includes("Proof Link: ")) {
            pLink = act.feedback.split("Proof Link: ")[1];
          }

          return {
            reactKey,
            id: baseId,
            pkColumn: isNew ? "id" : (act.activity_id ? "activity_id" : "id"),
            isNewArchitecture: isNew,
            uid: act.uid,
            studentName: studentMap[act.uid] || "Unknown Student",
            title: act.activity_name,
            type: act.type,
            date: `${act.from_date}${act.to_date && act.to_date !== act.from_date ? ` to ${act.to_date}` : ""}`,
            location: act.leave_required ? "Requires Attendance Leave" : (act.location || "No Leave Required"),
            desc: act.desc || "No description provided.",
            status: act.status || "Pending",
            proofLink: pLink,
          };
        });
        setRequests(mapped);
      } else {
        setRequests([]);
      }
      setLoading(false);
    }

    fetchPendingRequests();
    return startActivityRefresh(fetchPendingRequests);
  }, []);

  const handleAction = async (reactKey: string, action: "approve" | "reject", currentStatus: string) => {
    const reqItem = requests.find((r) => r.reactKey === reactKey);
    if (!reqItem) return;

    let status = "Rejected";
    if (action === "approve") {
      if (currentStatus === "Pending") status = "Pending Proof";
      else if (currentStatus === "Proof Submitted") status = "Approved";
      else status = "Approved";
    }

    const feedback = feedbacks[reactKey] || null;

    try {
      // 1. Update the database
      await approveStudentActivity(
        reqItem.isNewArchitecture,
        reqItem.id,
        reqItem.uid,
        reqItem.pkColumn,
        status,
        feedback
      );

      // 2. Remove the item from the local UI queue
      setRequests((prev) => prev.filter((req) => req.reactKey !== reactKey));
    } catch (error: any) {
      alert("Error updating request: " + error.message);
    }
  };

  const handleFeedbackChange = (reactKey: string, value: string) => {
    setFeedbacks((prev) => ({ ...prev, [reactKey]: value }));
  };

  return (
    <div className="max-w-4xl mx-auto">

      {/* --- Header --- */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-slate-800 tracking-tight">
            Priority <span className="text-[#17685E]">Queue</span>
          </h1>
          <p className="text-slate-500 mt-2">Rapid "One-Click" sign-offs for pending mentee requests.</p>
        </div>

        <div className="flex items-center gap-2 bg-[#FFFFFF] px-5 py-3 rounded-full border border-slate-200">
          <Clock size={18} className="text-[#8C6A31]" />
          <span className="font-bold text-slate-700">{loading ? "..." : requests.length} Pending</span>
        </div>
      </div>

      {/* --- Queue List --- */}
      <div className="space-y-8">
        <AnimatePresence>
          {loading ? (
            <motion.div initial={false} animate={{ opacity: 1 }} className="text-center py-10">
              <p className="text-slate-500 font-medium">Loading pending requests...</p>
            </motion.div>
          ) : requests.length === 0 ? (
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-20 bg-[#FFFFFF] rounded-lg border border-slate-200"
            >
              <div className="w-20 h-20 mx-auto bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-4 border border-slate-200">
                <CheckCircle size={40} />
              </div>
              <h3 className="text-2xl font-bold text-slate-700">All Caught Up!</h3>
              <p className="text-slate-500 mt-2">You have reviewed all pending requests.</p>
            </motion.div>
          ) : (
            requests.map((req) => (
              <motion.div
                key={req.reactKey}
                layout
                initial={false}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, x: 100 }}
                transition={{ duration: 0.3 }}
                className="bg-[#FFFFFF] p-6 md:p-8 rounded-lg md:rounded-lg border border-slate-200 flex flex-col gap-6"
              >

                {/* Card Header: Student Info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200/50 gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#17685E]/10 text-[#17685E] flex items-center justify-center border border-slate-200">
                      <UserCircle size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-700 text-lg">{req.studentName}</h4>
                      <p className="text-xs font-medium text-slate-500">{req.uid}</p>
                    </div>
                  </div>
                </div>

                {/* Card Body: Event Details */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1 gap-2">
                    <h3 className="text-xl font-bold text-slate-700 mb-1">{req.title}</h3>
                    </div>
                    <p className="text-sm font-medium text-[#17685E] mb-4">{req.type}</p>

                    <div className="space-y-2 text-sm text-slate-500 font-medium">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-slate-500" />
                        {req.date}
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-slate-500" />
                        {req.location}
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#FFFFFF] p-5 rounded-lg border border-slate-200 flex items-start gap-3">
                    <FileText size={18} className="text-slate-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-slate-600 leading-relaxed italic">
                        "{req.desc}"
                      </p>
                      {req.proofLink && (
                        <div className="mt-3 pt-3 border-t border-slate-200/50">
                          <p className="text-xs font-bold text-slate-500 mb-1">Attached Proof:</p>
                          <a href={req.proofLink && !/^https?:\/\//i.test(req.proofLink) ? `https://${req.proofLink}` : req.proofLink!} target="_blank" rel="noopener noreferrer" className="text-sm text-[#17685E] hover:underline font-medium break-all">
                            {req.proofLink}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer: Feedback & Actions */}
                <div className="flex flex-col md:flex-row gap-6 mt-2 pt-6 border-t border-slate-200/50">

                  {/* Feedback Box */}
                  <div className="flex-1 relative">
                    <div className="absolute left-4 top-4 text-slate-500">
                      <MessageSquare size={18} />
                    </div>
                    <textarea
                      rows={2}
                      value={feedbacks[req.reactKey] || ""}
                      onChange={(e) => handleFeedbackChange(req.reactKey, e.target.value)}
                      placeholder="Add an optional note to the student..."
                      className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-3 pl-12 pr-4 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 placeholder:text-slate-300 border-none resize-none text-sm"
                    />
                  </div>

                  {/* Action Pills */}
                  <div className="flex items-center gap-3 shrink-0">
                    <motion.button
                      onClick={() => handleAction(req.reactKey, "reject", req.status)}
                      className="flex items-center gap-2 px-6 py-4 rounded-lg bg-[#FFFFFF] border border-slate-200 text-rose-500 hover:bg-rose-500 hover:text-white transition-all font-bold text-sm border border-slate-200"
                    >
                      <XCircle size={18} /> Reject
                    </motion.button>

                    <motion.button
                      onClick={() => handleAction(req.reactKey, "approve", req.status)}
                      className="flex items-center gap-2 px-6 py-4 rounded-lg bg-emerald-500 text-white    transition-all font-bold text-sm"
                    >
                      <CheckCircle size={18} /> {req.status === "Pending" ? "Initial Approve" : "Verify Proof"}
                    </motion.button>
                  </div>
                </div>

              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
