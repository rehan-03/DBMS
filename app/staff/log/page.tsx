"use client";
import { signOut } from "next-auth/react";
import { getSession } from "@/lib/client-session";


import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Clock, X, MapPin, Calendar, FileText, ChevronDown, ChevronUp, Briefcase, FileDown, CheckCircle, Trash2 } from "lucide-react";
import { supabase } from "@/app/student/supabase";
import { startActivityRefresh } from "@/lib/activity-refresh";
import { createActivity, deleteActivity } from "@/app/actions/activities";
import { fetchMyStaffProfile, fetchStaffDirectory, fetchStudentDirectory } from "@/app/actions/reads";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import MultiTagInput from "@/app/student/components/MultiTagInput";

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

// Helper to make dates more compact (e.g., "12 Oct 23")
const formatShortDate = (dateString: string) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
};

export default function FacultyLogPage() {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [staffName, setStaffName] = useState("");
  const [staffList, setStaffList] = useState<{ suid: string; name: string }[]>([]);
  const [studentList, setStudentList] = useState<{ uid: string; name: string }[]>([]);
  const [currentUserSuid, setCurrentUserSuid] = useState("");

  // Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportYear, setExportYear] = useState("");

  const { min, max, today } = getDateConstraints();
  const router = useRouter();

  // Protect route: Ensure user is actually Staff
  useEffect(() => {
    const fetchDiaryData = async () => {
      const suid = ((await getSession())?.user as any)?.uid;
      if (!suid) {
        router.replace("/");
        return;
      }
      setCurrentUserSuid(suid);

      const staffData = await fetchMyStaffProfile();
      if (!staffData) {
        router.replace("/");
        return;
      }
      if (staffData.name) setStaffName(staffData.name);

      // Fetch activities for the timeline feed
      const { data: myActs } = await supabase.from("staff_activities").select("*").eq("suid", suid);
      const { data: taggedActsData } = await supabase.from("staff_activity_comentors").select("staff_activities(*)").eq("staff_suid", suid);

      const taggedActs = taggedActsData?.map((ta: any) => ta.staff_activities).filter(Boolean) || [];

      const allActsMap = new Map();
      [...(myActs || []), ...taggedActs].forEach((a: any) => {
        if (a && a.activity_id) allActsMap.set(a.activity_id, a);
      });

      const actData = Array.from(allActsMap.values()).sort((a, b) => new Date(b.from_date).getTime() - new Date(a.from_date).getTime());
      setActivities(actData);

      setLoadingActivities(false);

      // Fetch directories for the Multi-Tag Inputs
      const allStaff = await fetchStaffDirectory("suid, name");
      if (allStaff) setStaffList(allStaff);

      const allStudents = await fetchStudentDirectory("uid, name");
      if (allStudents) setStudentList(allStudents);
    };
    fetchDiaryData();
    return startActivityRefresh(fetchDiaryData);
  }, [router]);

  const [formData, setFormData] = useState({
    title: "",
    category: "Expert Session",
    division: "",
    targetBatch: "",
    academicYear: "",
    fromDate: today,
    toDate: today,
    fromTime: "",
    toTime: "",
    location: "",
    proofLink: "",
    description: "",
    participantUids: [] as string[],
    coMentorSuids: [] as string[],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const suid = ((await getSession())?.user as any)?.uid;
      if (!suid) {
        alert("Staff User not logged in");
        return;
      }

      const payload = {
        suid,
        activity_name: formData.title,
        type: formData.category,
        division: formData.division,
        target_batch: formData.targetBatch,
        academic_year: formData.academicYear,
        from_date: formData.fromDate,
        to_date: formData.toDate,
        from_time: formData.fromTime,
        to_time: formData.toTime,
        location: formData.location,
        proof_link: formData.proofLink || null,
        description: formData.description
      };

      const participantsPayload = formData.participantUids.map(uid => ({
        student_uid: String(uid)
      }));

      const mentorsPayload = formData.coMentorSuids.map(mSuid => ({
        staff_suid: String(mSuid)
      }));

      const result = await createActivity("staff_activities", payload, participantsPayload, mentorsPayload);
      const insertedData = result.success ? [result.data] : null;

      setShowSuccess(true);

      // Immediately push the new activity to the feed without reloading
      if (insertedData) setActivities([insertedData[0], ...activities]);

      setIsSheetOpen(false);
      // Reset form
      setFormData({ ...formData, title: "", division: "", targetBatch: "", academicYear: "", fromTime: "", toTime: "", location: "", proofLink: "", description: "", participantUids: [], coMentorSuids: [] });
      // Hide toast after 3 seconds
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error: any) {
      alert("Error saving activity: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (activityId: string | number) => {
    if (!window.confirm("Are you sure you want to delete this activity from your diary?")) return;
    try {
      await deleteActivity("staff_activities", String(activityId));
      setActivities(prev => prev.filter(a => a.activity_id !== activityId));
    } catch (error: any) {
      alert("Error deleting activity: " + error.message);
    }
  };

  // --- PDF Export Logic ---
  const handleExportPDF = () => {
    const doc = new jsPDF();

    // Filter activities based on the selected year
    const filtered = exportYear
      ? activities.filter(a => a.academic_year?.includes(exportYear))
      : activities;

    if (filtered.length === 0) {
      alert("No activities found for the selected filter.");
      return;
    }

    // PDF Headers
    doc.setFontSize(18);
    doc.text("Professional Diary Report", 14, 22);

    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated by CampusPulse`, 14, 30);
    doc.text(`Faculty Name: ${staffName || 'Staff Member'}`, 14, 36);
    if (exportYear) doc.text(`Academic Year Filter: ${exportYear}`, 14, 42);

    // Table Data
    const tableData = filtered.map(a => [
      a.activity_name,
      `${formatShortDate(a.from_date)}${a.to_date && a.to_date !== a.from_date ? ` - ${formatShortDate(a.to_date)}` : ''}`,
      a.type,
      a.academic_year || '-',
      a.division ? `${a.division} (${a.target_batch || '-'})` : a.target_batch || '-',
      a.location || '-'
    ]);

    autoTable(doc, {
      startY: exportYear ? 48 : 42,
      head: [['Title', 'Date', 'Category', 'Year', 'Div (Batch)', 'Location']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [96, 165, 250] }, // CampusPulse Blue (#17685E)
      styles: { fontSize: 9 },
    });

    doc.save(`Faculty_Report_${exportYear || 'All'}.pdf`);
    setIsExportModalOpen(false);
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case "Expert Session":
        return <Briefcase size={16} />;
      case "Publication":
        return <FileText size={16} />;
      default:
        return <MapPin size={16} />;
    }
  };

  // Get unique academic years for the export filter
  const uniqueYears = Array.from(new Set(activities.map(a => a.academic_year).filter(Boolean)));

  return (
    <div className="max-w-4xl mx-auto">

      {/* --- Header --- */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-slate-800 tracking-tight">
            Professional <span className="text-[#17685E]">Diary</span>
          </h1>
          <p className="text-slate-500 mt-2">Track your expert sessions, publications, and visits for self-appraisal.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
          {/* Export Button */}
          <motion.button
            onClick={() => setIsExportModalOpen(true)}
            className="bg-[#FFFFFF] text-slate-600 px-6 py-3 md:py-3 rounded-full font-semibold border border-slate-200 hover:text-[#17685E] transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <FileDown size={20} />
            Export Report
          </motion.button>

          {/* Log New Button */}
          <motion.button
            onClick={() => setIsSheetOpen(true)}
            className="bg-[#17685E] text-white px-6 py-3 md:py-3 rounded-full font-semibold  border border-slate-200 transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <Plus size={20} />
            Log Activity
          </motion.button>
        </div>
      </div>

      {/* --- Vertical Timeline Feed --- */}
      <div className="relative border-l-2 border-[#17685E]/20 ml-4 md:ml-6 space-y-8 pb-12">

        {loadingActivities && <p className="text-slate-500 text-sm font-medium ml-6">Loading diary entries...</p>}

        {!loadingActivities && activities.length === 0 && <p className="text-slate-500 text-sm font-medium ml-6">No activities have been logged yet.</p>}

        {activities.map((activity) => {
          const isExpanded = expandedId === activity.activity_id;

          return (
            <motion.div
              layout
              key={activity.activity_id}
              className="relative pl-8 md:pl-12"
            >
              {/* Timeline Dot */}
              <div className="absolute -left-[11px] top-6 w-5 h-5 rounded-full border-4 border-[#FFFFFF] bg-[#17685E]/10 flex items-center justify-center ">
                <div className="w-2 h-2 rounded-full bg-[#17685E]" />
              </div>

              {/* Neumorphic Card */}
              <motion.div
                layout
                onClick={() => setExpandedId(isExpanded ? null : activity.activity_id)}
                className="bg-[#FFFFFF] p-5 md:p-6 rounded-lg md:rounded-lg border border-slate-200 cursor-pointer border border-slate-200 transition-shadow"
              >
                <motion.div layout className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-3 py-1 rounded-full text-xs font-bold normal-case tracking-normal flex items-center gap-1 bg-[#17685E]/10 text-[#17685E]">
                        {getIconForType(activity.type)}
                        {activity.type}
                      </span>
                    </div>
                <h3 className="text-lg md:text-xl font-bold text-slate-700">{activity.activity_name}</h3>
                  </div>

                  <div className="flex items-center gap-4 text-slate-500 text-sm">
                    <div className="flex items-center gap-1">
                      <Calendar size={14} />
                      {formatShortDate(activity.from_date)} {activity.from_date !== activity.to_date && `- ${formatShortDate(activity.to_date)}`}
                    </div>

                    {/* Only show delete button if they are the original author */}
                    {activity.suid === currentUserSuid && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(activity.activity_id); }}
                        className="w-8 h-8 rounded-full bg-[#FFFFFF] border border-slate-200 flex items-center justify-center text-slate-500 hover:text-rose-500 transition-colors"
                        title="Delete Activity"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}

                    <div className="w-8 h-8 rounded-full bg-[#FFFFFF] border border-slate-200 flex items-center justify-center text-slate-500">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </motion.div>

                {/* Expandable Description */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={false}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-6 mt-6 border-t border-slate-200/50">
                        <div className="flex items-center gap-2 text-slate-500 text-sm mb-4 font-medium">
                          <MapPin size={16} className="text-[#8C6A31]" />
                          {activity.location}
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                      {activity.description}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      {/* --- Slide-Over Form Sheet --- */}
      <AnimatePresence>
        {isSheetOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSheetOpen(false)}
              className="fixed inset-0 bg-slate-900/20  z-50"
            />

            {/* Sheet */}
            <motion.div
              initial={false}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-xl bg-[#FFFFFF]  z-50 overflow-y-auto border-l border-slate-200"
            >
              <div className="p-6 md:p-8">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold text-slate-800">Add Entry</h2>
                  <button
                    onClick={() => setIsSheetOpen(false)}
                    className="w-10 h-10 rounded-full bg-[#FFFFFF] border border-slate-200 flex items-center justify-center text-slate-500 hover:text-rose-500 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <form className="space-y-6" onSubmit={handleSubmit}>

                  {/* Input: Title */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Activity Title</label>
                    <input
                      type="text" required
                      value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}
                      className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-4 px-6 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 placeholder:text-slate-300 border-none"
                      placeholder="e.g., AI/ML Guest Lecture"
                    />
                  </div>

                  {/* Input: Category & Academic Year row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Category</label>
                      <select
                        value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}
                        className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-4 px-6 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none appearance-none cursor-pointer"
                      >
                        <option>Expert Session</option>
                        <option>Publication</option>
                        <option>Workshop/FDP</option>
                        <option>Industrial Visit</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Academic Year(s)</label>
                      <input
                        type="text"
                        value={formData.academicYear} onChange={e => setFormData({...formData, academicYear: e.target.value})}
                        className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-4 px-6 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 placeholder:text-slate-300 border-none"
                        placeholder="e.g., 2023-24, 2024-25"
                      />
                    </div>
                  </div>

                  {/* Input: Division & Batch row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Division(s)</label>
                      <input
                        type="text"
                        value={formData.division} onChange={e => setFormData({...formData, division: e.target.value})}
                        className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-4 px-6 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 placeholder:text-slate-300 border-none"
                        placeholder="e.g., A, B"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Target Batch(es)</label>
                      <input
                        type="text"
                        value={formData.targetBatch} onChange={e => setFormData({...formData, targetBatch: e.target.value})}
                        className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-4 px-6 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 placeholder:text-slate-300 border-none"
                        placeholder="e.g., A1, A2, B1"
                      />
                    </div>
                  </div>

                  {/* Multi-Tag Inputs: Co-Faculty and Students */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <MultiTagInput
                      label="Co-Faculty (Optional)"
                      placeholder="Search colleagues..."
                      options={staffList.filter(s => String(s.suid) !== String(currentUserSuid)).map(s => ({ id: String(s.suid), name: s.name }))}
                      selectedIds={formData.coMentorSuids}
                      onChange={(ids) => setFormData({...formData, coMentorSuids: ids})}
                    />
                    <MultiTagInput
                      label="Students Involved (Optional)"
                      placeholder="Search students..."
                      options={studentList.map(s => ({ id: String(s.uid), name: s.name }))}
                      selectedIds={formData.participantUids}
                      onChange={(ids) => setFormData({...formData, participantUids: ids})}
                    />
                  </div>

                  {/* Input: Date Range */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">From Date</label>
                      <input
                        type="date" required
                        min={min} max={max}
                        value={formData.fromDate} onChange={e => setFormData({...formData, fromDate: e.target.value})}
                        className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-4 px-6 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">To Date</label>
                      <input
                        type="date" required
                        min={min} max={max}
                        value={formData.toDate} onChange={e => setFormData({...formData, toDate: e.target.value})}
                        className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-4 px-6 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none"
                      />
                    </div>
                  </div>

                  {/* Input: Time Range */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">From Time</label>
                      <input
                        type="time" required
                        value={formData.fromTime} onChange={e => setFormData({...formData, fromTime: e.target.value})}
                        className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-4 px-6 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">To Time</label>
                      <input
                        type="time" required
                        value={formData.toTime} onChange={e => setFormData({...formData, toTime: e.target.value})}
                        className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-4 px-6 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none"
                      />
                    </div>
                  </div>

                  {/* Input: Location */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Location / Journal</label>
                    <input
                      type="text" required
                      value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})}
                      className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-4 px-6 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 placeholder:text-slate-300 border-none"
                      placeholder="Where did this happen?"
                    />
                  </div>

                  {/* Input: Proof/Link */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Proof / Link (Optional)</label>
                    <input
                      type="url"
                      value={formData.proofLink} onChange={e => setFormData({...formData, proofLink: e.target.value})}
                      className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-4 px-6 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 placeholder:text-slate-300 border-none"
                      placeholder="https://..."
                    />
                  </div>

                  {/* Input: Description */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Description & Impact</label>
                    <textarea
                      rows={4} required
                      value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                      className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-4 px-6 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 placeholder:text-slate-300 border-none resize-none"
                      placeholder="Briefly explain your role, target audience, and impact..."
                    />
                  </div>

                  <motion.button
                    disabled={loading}
                    type="submit"
                    className="w-full bg-[#17685E] text-white font-bold py-4 rounded-full  border border-slate-200 transition-all flex items-center justify-center gap-2 mt-8 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {loading ? "Saving..." : "Save to Diary"}
                  </motion.button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Success Toast Notification */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 bg-[#FFFFFF] text-slate-700 px-6 py-4 rounded-lg border border-slate-200 flex items-center gap-3 font-bold z-[60]"
          >
            <CheckCircle size={24} className="text-emerald-500" />
            Activity saved
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Export Filter Modal --- */}
      <AnimatePresence>
        {isExportModalOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsExportModalOpen(false)}
              className="fixed inset-0 bg-slate-900/20  z-50 flex items-center justify-center p-4"
            >
              {/* Modal Content */}
              <motion.div
                initial={false}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()} // Prevent clicking inside from closing it
                className="bg-[#FFFFFF] p-6 md:p-8 rounded-lg border border-slate-200 w-full max-w-sm"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-slate-700">Export Report</h3>
                  <button onClick={() => setIsExportModalOpen(false)} className="text-slate-500 hover:text-rose-500 transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4 mb-8">
                  <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Filter by Academic Year</label>
                  <select
                    value={exportYear}
                    onChange={(e) => setExportYear(e.target.value)}
                    className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-3 px-4 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none appearance-none cursor-pointer"
                  >
                    <option value="">All Years</option>
                    {uniqueYears.map((year: any, i) => (
                      <option key={i} value={year}>{year}</option>
                    ))}
                  </select>
                </div>

                <motion.button
                  onClick={handleExportPDF}
                  className="w-full bg-[#17685E] text-white font-bold py-3 rounded-full  border border-slate-200 transition-all flex items-center justify-center gap-2"
                >
                  <FileDown size={18} />
                  Generate PDF
                </motion.button>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
