"use client";
import { signOut } from "next-auth/react";
import { getSession } from "@/lib/client-session";


import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/student/supabase";
import { startActivityRefresh } from "@/lib/activity-refresh";
import { createActivity, deleteActivity, attachActivityProof } from "@/app/actions/activities";
import { checkStudentExists, fetchStaffDirectory, fetchStudentDirectory } from "@/app/actions/reads";
import { Save, ArrowLeft, CheckCircle, Plus, List, Clock, XCircle, Trash2, Calendar, Link as LinkIcon } from "lucide-react";
import MultiTagInput from "../components/MultiTagInput";

// Helper function for 15-day date constraints
const getDateConstraints = () => {
  const today = new Date();
  const minDate = new Date(today);
  minDate.setDate(today.getDate() - 15);
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 15);
  const formatDate = (date: Date) => date.toISOString().split('T')[0];
  return { min: formatDate(minDate), max: formatDate(maxDate), today: formatDate(today) };
};

// Helper to make dates more compact
const formatShortDate = (dateString: string) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
};

export default function LogActivityPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"new" | "history">("new");
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [staffList, setStaffList] = useState<{ suid: string; name: string }[]>([]);
  const [studentList, setStudentList] = useState<{ uid: string; name: string }[]>([]);
  const [currentUserUid, setCurrentUserUid] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [proofInputId, setProofInputId] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string>("");

  const { min, max, today } = getDateConstraints();

  const [formData, setFormData] = useState({
    title: "",
    category: "Technical",
    description: "",
    fromDate: today,
    toDate: today,
    fromTime: "",
    toTime: "",
    leave_required: false,
    participantUids: [] as string[],
    mentorSuids: [] as string[],
  });

  // Fetch available staff members to populate the Mentor dropdown
  useEffect(() => {
    // Protect route: Ensure user is actually a Student
    async function verifyStudent() {
      const uid = ((await getSession())?.user as any)?.uid;
      if (!uid) {
        router.replace("/");
        return;
      }
      const data = await checkStudentExists(uid);
      if (!data) {
        router.replace("/"); // Not found in students table
      } else {
        setCurrentUserUid(uid);
      }
    }

    async function fetchStaff() {
      const data = await fetchStaffDirectory("suid, name");
      if (data) setStaffList(data);
    }
    async function fetchStudents() {
      const data = await fetchStudentDirectory("uid, name");
      if (data) setStudentList(data);
    }
    verifyStudent();
    fetchStaff();
    fetchStudents();
  }, [router]);

  const fetchActivities = async (background = false) => {
    if (!background) setLoadingHistory(true);
    try {
      const uid = ((await getSession())?.user as any)?.uid;
      if (!uid) return;

      const { data } = await supabase
        .from("activity_participants")
        .select(`
          status,
          group_activities ( id, title, category, description, start_date, end_date, created_at )
        `)
        .eq("student_uid", uid);

      if (data) {
        const formatted = data.map((d: any) => ({
          id: d.group_activities?.id,
          title: d.group_activities?.title,
          category: d.group_activities?.category,
          description: d.group_activities?.description,
          start_date: d.group_activities?.start_date,
          end_date: d.group_activities?.end_date,
          created_at: d.group_activities?.created_at,
          status: d.status
        })).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setActivities(formatted);
      }
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === "history") {
      fetchActivities();
      return startActivityRefresh(() => fetchActivities(true));
    }
  }, [activeTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.mentorSuids.length === 0) {
      alert("Select at least one faculty mentor so your activity can reach their approval queue.");
      return;
    }
    setLoading(true);
    try {
      const uid = ((await getSession())?.user as any)?.uid;
      if (!uid) {
        router.push("/");
        return;
      }

      const payload = {
        title: formData.title,
        category: formData.category,
        description: formData.description,
        start_date: formData.fromDate,
        end_date: formData.toDate,
        from_time: formData.fromTime,
        to_time: formData.toTime,
        leave_required: formData.leave_required,
        created_by: String(uid)
      };

      const allParticipants = Array.from(new Set([String(uid), ...formData.participantUids]));
      const participantsPayload = allParticipants.map(pUid => ({
        student_uid: String(pUid),
        status: "Pending"
      }));

      const mentorsPayload = formData.mentorSuids.map(mSuid => ({
        staff_suid: String(mSuid)
      }));

      await createActivity("group_activities", payload, participantsPayload, mentorsPayload);

      setShowSuccess(true);
      setFormData({ ...formData, title: "", description: "", participantUids: [], mentorSuids: [] });
      setTimeout(() => {
        setShowSuccess(false);
        setActiveTab("history");
      }, 1500);
    } catch (error: any) {
      alert("Error logging activity: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (activityId: string) => {
    if (!window.confirm("Are you sure you want to delete this pending activity?")) return;
    try {
      await deleteActivity("group_activities", activityId);
      setActivities(prev => prev.filter(a => a.id !== activityId));
    } catch (error: any) {
      alert("Error deleting activity: " + error.message);
    }
  };

  const handleAddProof = async (activityId: string) => {
    if (!proofUrl.trim()) return;
    try {
      const uid = ((await getSession())?.user as any)?.uid;
      if (!uid) return;
      await attachActivityProof(true, activityId, uid, proofUrl.trim(), 'id');

      setActivities(prev => prev.map(a => a.id === activityId ? { ...a, status: 'Proof Submitted' } : a));
      setProofInputId(null);
      setProofUrl("");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (err: any) {
      alert("Error adding proof: " + err.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="p-3 rounded-full bg-[#FFFFFF] border border-slate-200 text-slate-500 hover:text-[#17685E] transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight">Log New Activity</h1>
          <p className="text-slate-500 text-sm mt-1">Submit your activity details for faculty approval.</p>
        </div>
      </div>

      {/* Tabs */}
      <motion.div initial={false} animate={{ opacity: 1, y: 0 }} className="flex gap-4 mb-6">
        <button onClick={() => setActiveTab("new")} className={`px-6 py-3 rounded-full font-bold normal-case tracking-normal text-xs transition-all flex items-center gap-2 ${activeTab === "new" ? "bg-[#17685E] text-white  border border-slate-200" : "bg-[#FFFFFF] text-slate-500 border border-slate-200"}`}>
          <Plus size={16} /> Log New Activity
        </button>
        <button onClick={() => setActiveTab("history")} className={`px-6 py-3 rounded-full font-bold normal-case tracking-normal text-xs transition-all flex items-center gap-2 ${activeTab === "history" ? "bg-[#17685E] text-white  border border-slate-200" : "bg-[#FFFFFF] text-slate-500 border border-slate-200"}`}>
          <List size={16} /> My History
        </button>
      </motion.div>

      <AnimatePresence mode="wait">
        {activeTab === "new" ? (
          <motion.form
            key="new"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            onSubmit={handleSubmit}
            className="p-6 md:p-8 rounded-lg bg-[#FFFFFF] border border-slate-200 space-y-6 max-w-2xl"
          >
            {/* Title */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Activity Title</label>
              <input
                type="text" required
                value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}
                className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-3 px-4 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none"
                placeholder="e.g. National Hackathon 2026"
              />
            </div>

            {/* Category & Mentor */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Category</label>
                <select
                  value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}
                  className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-3 px-4 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none appearance-none cursor-pointer"
                >
                  <option>Technical</option>
                  <option>Cultural</option>
                  <option>Sports</option>
                  <option>Workshop/Seminar</option>
                </select>
              </div>
              <MultiTagInput
                label="Faculty Mentors (required)"
                placeholder="Search mentors..."
                options={staffList.map(s => ({ id: String(s.suid), name: s.name }))}
                selectedIds={formData.mentorSuids}
                onChange={(ids) => setFormData({...formData, mentorSuids: ids})}
                accentColor="#17685E"
              />
            </div>

            {/* Team Members (Peers) */}
            <MultiTagInput
              label="Team Members (Peers)"
              placeholder="Search co-participants..."
              options={studentList.filter(s => String(s.uid) !== String(currentUserUid)).map(s => ({ id: String(s.uid), name: s.name }))}
              selectedIds={formData.participantUids}
              onChange={(ids) => setFormData({...formData, participantUids: ids})}
              accentColor="#17685E"
            />

            {/* Input: Date Range */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">From Date</label>
                <input
                  type="date" required
                  min={min} max={max}
                  value={formData.fromDate} onChange={e => setFormData({...formData, fromDate: e.target.value})}
                  className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-3 px-4 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">To Date</label>
                <input
                  type="date" required
                  min={min} max={max}
                  value={formData.toDate} onChange={e => setFormData({...formData, toDate: e.target.value})}
                  className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-3 px-4 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none"
                />
              </div>
            </div>

            {/* Input: Time Range */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">From Time</label>
                <input
                  type="time" required
                  value={formData.fromTime} onChange={e => setFormData({...formData, fromTime: e.target.value})}
                  className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-3 px-4 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">To Time</label>
                <input
                  type="time" required
                  value={formData.toTime} onChange={e => setFormData({...formData, toTime: e.target.value})}
                  className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-3 px-4 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Description / Outcomes</label>
              <textarea
                required rows={3}
                value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-3 px-4 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none"
                placeholder="Briefly describe the activity..."
              />
            </div>

            {/* Leave Required Checkbox */}
            <div className="flex items-center gap-3 ml-4 pt-2">
              <input
                type="checkbox" id="leave"
                checked={formData.leave_required} onChange={e => setFormData({...formData, leave_required: e.target.checked})}
                className="w-5 h-5 accent-[#17685E] bg-[#FFFFFF] rounded outline-none cursor-pointer"
              />
              <label htmlFor="leave" className="text-sm font-medium text-slate-600 cursor-pointer">Requires Attendance Leave(Class Work)</label>
            </div>

            <motion.button
              disabled={loading}
              type="submit"
              className="w-full bg-[#17685E] text-white font-bold py-4 rounded-full  border border-slate-200 transition-all flex items-center justify-center gap-2 mt-4"
            >
              <Save size={20} />
              {loading ? "Saving..." : "Submit Activity"}
            </motion.button>
          </motion.form>
        ) : (
          <motion.div key="history" initial={false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
            {loadingHistory ? (
              <div className="text-center py-10"><p className="text-slate-500 font-medium">Loading history...</p></div>
            ) : activities.length === 0 ? (
              <div className="bg-[#FFFFFF] p-12 rounded-lg text-center border border-slate-200">
                <p className="text-slate-500 font-medium">You haven't logged any activities yet.</p>
              </div>
            ) : (
              <div className="relative border-l-2 border-[#17685E]/20 ml-4 md:ml-6 space-y-8 py-4">
                {activities.map((activity, i) => (
                  <motion.div
                    key={activity.id}
                    initial={false} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                    className="relative pl-8 md:pl-12"
                  >
                    <div className="absolute -left-[11px] top-6 w-5 h-5 rounded-full border-4 border-[#FFFFFF] bg-[#17685E]/10 flex items-center justify-center ">
                      <div className="w-2 h-2 rounded-full bg-[#17685E]" />
                    </div>

                    <div className="bg-[#FFFFFF] p-5 md:p-6 rounded-lg md:rounded-lg border border-slate-200 flex flex-col md:flex-row justify-between gap-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="px-3 py-1 rounded-full text-xs font-bold normal-case tracking-normal bg-[#17685E]/10 text-[#17685E]">
                            {activity.category}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold normal-case tracking-normal flex items-center gap-1 ${activity.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : activity.status === 'Rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                            {activity.status === 'Approved' ? <CheckCircle size={10} /> : activity.status === 'Rejected' ? <XCircle size={10} /> : <Clock size={10} />}
                            {activity.status}
                          </span>
                        </div>
                        <h3 className="text-xl font-bold text-slate-700">{activity.title}</h3>
                        <div className="flex items-center gap-4 text-slate-500 text-xs font-semibold mt-2">
                          <span className="flex items-center gap-1"><Calendar size={12} /> {formatShortDate(activity.start_date)} {activity.start_date !== activity.end_date && `- ${formatShortDate(activity.end_date)}`}</span>
                        </div>
                        {activity.description && (
                          <div className="pt-4 mt-4 border-t border-slate-200/50">
                            <p className="text-sm text-slate-600 leading-relaxed line-clamp-2">{activity.description}</p>
                          </div>
                        )}
                        {proofInputId === activity.id && (
                          <div className="pt-4 mt-4 border-t border-slate-200/50 flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                              <div className="absolute left-3 top-3 text-slate-500">
                                <LinkIcon size={16} />
                              </div>
                              <input
                                type="url"
                                placeholder="Paste proof link (e.g. Google Drive, Certificate URL)"
                                value={proofUrl}
                                onChange={(e) => setProofUrl(e.target.value)}
                                className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#17685E]/30 border-none"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleAddProof(activity.id)}
                                className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold   "
                              >
                                Submit
                              </button>
                              <button
                                onClick={() => { setProofInputId(null); setProofUrl(""); }}
                                className="px-4 py-2 bg-[#FFFFFF] text-slate-600 rounded-lg text-sm font-bold border border-slate-200"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col items-end justify-start min-w-[120px] border-t md:border-t-0 md:border-l border-slate-200/50 pt-4 md:pt-0 md:pl-4 gap-3">
                        {activity.status === 'Pending' && (
                          <button
                            onClick={() => handleDelete(activity.id)}
                            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#FFFFFF] border border-slate-200 text-slate-500 hover:text-rose-500 transition-all"
                            title="Delete Activity"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        {activity.status === 'Pending Proof' && proofInputId !== activity.id && (
                          <button
                            onClick={() => setProofInputId(activity.id)}
                            className="px-4 py-2 w-full text-xs font-bold rounded-lg bg-[#17685E] text-white  border border-slate-200 transition-all text-center"
                          >
                            Add Proof
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Toast Notification */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 bg-[#FFFFFF] text-slate-700 px-6 py-4 rounded-lg border border-slate-200 flex items-center gap-3 font-bold z-50"
          >
            <CheckCircle size={24} className="text-emerald-500" />
            Activity logged
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
