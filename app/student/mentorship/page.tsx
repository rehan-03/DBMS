"use client";
import { signOut } from "next-auth/react";
import { getSession } from "@/lib/client-session";


import React, { useState, useEffect } from "react";
import { motion, Variants } from "framer-motion";
import { Building, MessageSquare, CheckCircle, XCircle, Clock, ShieldCheck, HelpCircle } from "lucide-react";
import { supabase } from "@/app/student/supabase";
import { startActivityRefresh } from "@/lib/activity-refresh";
import { useRouter } from "next/navigation";
import { fetchStudentByUid, fetchStaffBySuid } from "@/app/actions/reads";

export default function MentorshipPage() {
  const [mentorInfo, setMentorInfo] = useState<{name: string, department?: string} | null>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchMentorshipData() {
      try {
        const uid = ((await getSession())?.user as any)?.uid;
        if (!uid) {
          router.replace("/");
          return;
        }

        // 1. Fetch student's division
        const { data: student, error: studentError } = await fetchStudentByUid(uid);

        if (studentError || !student) {
          router.replace("/"); // Kicks out staff trying to access student pages
          return;
        }

        console.log("1. Student Division:", student?.division);

        // 2. Fetch their class coordinator based on division
        if (student?.division) {
          const { data: coordData, error: coordError } = await supabase
            .from("class_coordinators")
            .select("suid")
            .eq("division", student.division)
            .maybeSingle();

          if (coordError) console.error("Error fetching coordinator:", coordError);
          console.log("2. Coordinator Data:", coordData);

          if (coordData?.suid) {
            // 3. Fetch the staff details directly
            const { data: staffData, error: staffError } = await fetchStaffBySuid(coordData.suid);

            if (staffError) console.error("Error fetching staff:", staffError);
            console.log("3. Staff Data:", staffData);

            if (staffData) {
              let resolvedDept = staffData.department || "Department N/A";
              if (staffData.department_id) {
                const { data: dept } = await supabase.from("departments").select("department_name").eq("department_id", staffData.department_id).maybeSingle();
                if (dept) resolvedDept = dept.department_name;
              }
              setMentorInfo({
                name: staffData.name,
                department: resolvedDept
              });
            }
          }
        }

        // Include current group logs as well as the legacy activity history.
        const [legacy, current] = await Promise.all([
          supabase.from("student_activities").select("*").eq("uid", uid),
          supabase.from("activity_participants")
            .select("status, feedback, group_activities (id, title, start_date, end_date, created_at)")
            .eq("student_uid", uid),
        ]);
        if (legacy.error || current.error) {
          throw new Error(legacy.error?.message || current.error?.message);
        }
        const groupLogs = (current.data || [])
          .filter((entry: any) => entry.group_activities)
          .map((entry: any) => ({
            activity_id: entry.group_activities.id,
            activity_name: entry.group_activities.title,
            from_date: entry.group_activities.start_date,
            to_date: entry.group_activities.end_date,
            status: entry.status,
            feedback: entry.feedback,
          }));
        setActivities([...(legacy.data || []), ...groupLogs].sort((a, b) =>
          new Date(b.from_date).getTime() - new Date(a.from_date).getTime()
        ));
      } catch (error) {
        console.error("Error fetching mentorship data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchMentorshipData();
    return startActivityRefresh(fetchMentorshipData);
  }, []);

  const containerVars = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.15 }
    }
  };

  const itemVars: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="max-w-4xl mx-auto">

      {/* --- Header --- */}
      <div className="mb-10">
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-slate-800 tracking-tight">
          Mentorship <span className="text-[#17685E]">Workspace</span>
        </h1>
        <p className="text-slate-500 mt-2">Connect with your faculty mentor and review their feedback.</p>
      </div>

      <motion.div
        variants={containerVars}
        initial={false}
        animate="show"
        className="space-y-10"
      >

        {/* --- Mentor Profile Card --- */}
        <motion.div variants={itemVars} className="bg-[#FFFFFF] p-6 md:p-8 rounded-lg md:rounded-lg border border-slate-200 flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8 relative overflow-hidden">
          {/* Decorative background circle */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

          <div className="flex-shrink-0 w-24 h-24 md:w-32 md:h-32 rounded-full bg-[#FFFFFF] border border-slate-200 flex items-center justify-center border-4 border-slate-200">
            <ShieldCheck size={48} className="text-emerald-500/50" />
          </div>

          <div className="flex-1 text-center md:text-left z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-bold normal-case tracking-normal mb-3">
              <CheckCircle size={14} /> Assigned Mentor
            </div>
            <h3 className="text-2xl md:text-3xl font-semibold text-slate-700">
              {loading ? "Loading..." : mentorInfo?.name || "Not Assigned"}
            </h3>
            <p className="text-[#17685E] font-medium mt-1">Class Coordinator</p>
            <p className="text-slate-500 text-sm flex items-center justify-center md:justify-start gap-2 mt-2">
              <Building size={16} /> {loading ? "Loading..." : mentorInfo?.department || "Department N/A"}
            </p>
          </div>
        </motion.div>

        {/* --- Validation History --- */}
        <motion.div variants={itemVars}>
          <h4 className="text-xl font-bold text-slate-700 mb-6 flex items-center gap-2">
            <MessageSquare size={24} className="text-[#8C6A31]" />
            Validation History
          </h4>

          <div className="space-y-6">
            {loading && <p className="text-slate-500 text-sm font-medium ml-2">Loading history...</p>}

            {!loading && activities.length === 0 && (
              <p className="text-slate-500 text-sm font-medium ml-2">No activities have been logged yet.</p>
            )}

            {activities.map((item) => (
              <div key={item.activity_id} className="bg-[#FFFFFF] p-5 md:p-6 rounded-lg md:rounded-lg border border-slate-200">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                  <div>
                    <h5 className="font-bold text-slate-700 text-lg">{item.activity_name}</h5>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 font-medium">
                      <Clock size={14} /> {item.from_date} to {item.to_date}
                    </div>
                  </div>

                  {item.status === "Approved" ? (
                    <div className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-bold normal-case tracking-normal self-start md:self-auto">
                      <CheckCircle size={16} /> Approved
                    </div>
                  ) : item.status === "Rejected" ? (
                    <div className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-rose-500/10 text-rose-600 text-xs font-bold normal-case tracking-normal self-start md:self-auto">
                      <XCircle size={16} /> Rejected
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-amber-500/10 text-amber-600 text-xs font-bold normal-case tracking-normal self-start md:self-auto">
                      <HelpCircle size={16} /> {item.status || "Pending"}
                    </div>
                  )}
                </div>

                {/* Mentor Feedback (only visible if a comment exists) */}
                {(item.feedback || item.comment) && (
                  <div className="relative bg-[#FFFFFF] p-5 rounded-lg border border-slate-200 mt-4">
                    <div className="absolute top-4 left-4 text-slate-300">
                      <MessageSquare size={16} />
                    </div>
                    <p className="text-slate-600 text-sm leading-relaxed pl-8">
                      <span className="font-bold text-slate-700 mr-2">Mentor Note:</span>
                      {item.feedback || item.comment}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

      </motion.div>
    </div>
  );
}
