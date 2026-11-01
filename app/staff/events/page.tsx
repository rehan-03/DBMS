"use client";
import { signOut } from "next-auth/react";
import { getSession } from "@/lib/client-session";


import React, { useState, useEffect } from "react";
import { motion, Variants } from "framer-motion";
import { CalendarPlus, Send, Clock, FileText, CheckCircle, XCircle, IndianRupee, Trash2 } from "lucide-react";
import { fetchStaffBySuid } from "@/app/actions/reads";
import { createEventProposal, deleteEventProposal } from "@/app/actions/events";
import { supabase } from "@/app/student/supabase";
import { normalizeEventProposal, prepareEventProposal } from "@/lib/event-proposals";
import { startActivityRefresh } from "@/lib/activity-refresh";

// Helper function for 30-day date constraints
const getDateConstraints = () => {
  const today = new Date();
  const minDate = new Date(today);
  minDate.setDate(today.getDate() - 30);
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 30);
  const toDateTimeLocal = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  return { min: toDateTimeLocal(minDate), max: toDateTimeLocal(maxDate) };
};

export default function StaffEventsPage() {
  const [activeTab, setActiveTab] = useState<"new" | "history">("new");
  const [staffData, setStaffData] = useState<any>(null);
  const [myProposals, setMyProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    event_type: "Workshop",
    club_name: "",
    description: "",
    target_audience: "Department Only",
    expected_footfall: "",
    guest_speaker: "",
    teacher_coordinator: "",
    start_date: "",
    end_date: "",
    venue: "",
    special_requirements: "",
    estimated_budget: "",
    budget_breakdown: ""
  });

  const { min, max } = getDateConstraints();

  useEffect(() => {
    fetchData();
    return startActivityRefresh(fetchData);
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch("/api/events", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.role !== "staff") throw new Error("Your login changed. Reopen Events from your current workspace.");
      setStaffData(result.profile);
      setMyProposals(result.proposals);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load event proposals.");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (!staffData?.suid) throw new Error("Your faculty profile is unavailable. Reload Events before submitting.");
      const payload = prepareEventProposal(formData);

      const result = await createEventProposal(payload, { uid: staffData.suid, role: "staff" });
      if (!result.success) throw new Error("Failed to create proposal.");

      // Add to list if server returned data, otherwise refetch on tab switch
      if (result.data) {
        const inserted = Array.isArray(result.data) ? result.data[0] : result.data;
        if (inserted) setMyProposals([inserted, ...myProposals]);
      }

      alert("Event proposal submitted successfully!");
      setActiveTab("history");

      // Reset form
      setFormData({
        title: "", event_type: "Workshop", club_name: "", description: "",
        target_audience: "Department Only", expected_footfall: "", guest_speaker: "",
        teacher_coordinator: "", start_date: "", end_date: "", venue: "",
        special_requirements: "", estimated_budget: "", budget_breakdown: ""
      });

    } catch (error: any) {
      alert("Error submitting proposal: " + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this pending proposal?")) return;
    try {
      await deleteEventProposal(id);
      setMyProposals((prev) => prev.filter((p) => p.id !== id));
    } catch (error: any) {
      alert("Error deleting proposal: " + error.message);
    }
  };

  const containerVars = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVars: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  if (loading) return <div className="text-slate-500 font-medium">Loading Event Center...</div>;
  if (!staffData) return <p role="alert" className="text-slate-600">{loadError || "Your faculty profile is unavailable. Please sign in again."}</p>;

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-10">
      {loadError && <p role="alert" className="text-rose-600">{loadError}</p>}

      {/* --- Header --- */}
      <motion.div initial={false} animate={{ opacity: 1, x: 0 }}>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
          <CalendarPlus className="text-[#17685E]" size={36} />
          Faculty Event <span className="text-[#17685E]">Proposals</span>
        </h1>
        <p className="text-slate-500 mt-2">Submit and track departmental event requests requiring HOD approval.</p>
      </motion.div>

      {/* --- Tabs --- */}
      <motion.div initial={false} animate={{ opacity: 1, y: 0 }} className="flex gap-4">
        <button onClick={() => setActiveTab("new")} className={`px-8 py-3 rounded-full font-bold normal-case tracking-normal text-xs transition-all ${activeTab === "new" ? "bg-[#17685E] text-white  border border-slate-200" : "bg-[#FFFFFF] text-slate-500 border border-slate-200"}`}>
          New Proposal
        </button>
        <button onClick={() => setActiveTab("history")} className={`px-8 py-3 rounded-full font-bold normal-case tracking-normal text-xs transition-all ${activeTab === "history" ? "bg-[#17685E] text-white  border border-slate-200" : "bg-[#FFFFFF] text-slate-500 border border-slate-200"}`}>
          My Proposals
        </button>
      </motion.div>

      {/* --- Content Area --- */}
      {activeTab === "new" ? (
        <motion.div initial={false} animate={{ opacity: 1, y: 0 }} className="bg-[#FFFFFF] p-6 md:p-8 rounded-lg border border-slate-200">
          <form onSubmit={handleSubmit} className="space-y-8">

            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Event Title</label>
                <input required type="text" name="title" value={formData.title} onChange={handleInputChange} placeholder="e.g. AI & Machine Learning Workshop" className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 placeholder:text-slate-500 border-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Event Type</label>
                <select name="event_type" value={formData.event_type} onChange={handleInputChange} className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none cursor-pointer">
                  <option>Seminar</option><option>Workshop</option><option>Hackathon</option><option>Cultural</option><option>Sports</option><option>Guest Lecture</option><option>Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Club / Committee (Optional)</label>
                <input type="text" name="club_name" value={formData.club_name} onChange={handleInputChange} placeholder="e.g. Coding Club" className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 placeholder:text-slate-500 border-none" />
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Description / Objective</label>
              <textarea required name="description" value={formData.description} onChange={handleInputChange} rows={3} placeholder="What is the purpose of this event?" className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-4 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 placeholder:text-slate-500 resize-none border-none" />
            </div>

            {/* Logistics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Start Date & Time</label>
                <input required type="datetime-local" min={min} max={max} name="start_date" value={formData.start_date} onChange={handleInputChange} className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">End Date & Time</label>
                <input required type="datetime-local" min={formData.start_date || min} max={max} name="end_date" value={formData.end_date} onChange={handleInputChange} className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Requested Venue</label>
                <input required type="text" name="venue" value={formData.venue} onChange={handleInputChange} placeholder="e.g. Main Seminar Hall" className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Expected Footfall</label>
                <input required type="number" min="1" step="1" name="expected_footfall" value={formData.expected_footfall} onChange={handleInputChange} placeholder="e.g. 150" className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none" />
              </div>
            </div>

            {/* Financials & Extra */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Estimated Budget (₹)</label>
                <input required type="number" min="0" step="0.01" name="estimated_budget" value={formData.estimated_budget} onChange={handleInputChange} placeholder="e.g. 5000" className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Teacher Coordinator</label>
                <input type="text" name="teacher_coordinator" value={formData.teacher_coordinator} onChange={handleInputChange} placeholder="e.g. Prof. Smith" className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none" />
              </div>
            </div>

            <motion.button disabled={submitting} type="submit" className="w-full bg-[#17685E] text-white font-bold py-4 rounded-full  border border-slate-200 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70">
              <Send size={18} /> {submitting ? "Submitting to HOD..." : "Submit Proposal"}
            </motion.button>
          </form>
        </motion.div>
      ) : (
        /* --- My Proposals History --- */
        <motion.div variants={containerVars} initial={false} animate="show" className="space-y-6">
          {myProposals.length === 0 ? (
            <div className="bg-[#FFFFFF] p-12 rounded-lg border border-slate-200 text-center text-slate-500 font-medium">
              You haven't submitted any event proposals yet.
            </div>
          ) : (
            myProposals.map((p, i) => (
              <motion.div
                key={p.id}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-[#FFFFFF] p-6 md:p-8 rounded-lg border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
              >

                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold normal-case tracking-normal bg-blue-100 text-blue-700 px-3 py-1 rounded-full">{p.event_type}</span>
                    <span className="text-xs font-bold normal-case tracking-normal bg-slate-200 text-slate-500 px-3 py-1 rounded-full flex items-center gap-1"><Clock size={10}/> {new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">{p.title}</h3>
                  <p className="text-sm text-slate-500 line-clamp-2">{p.description}</p>

                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 pt-2">
                    <span className="flex items-center gap-1"><FileText size={14} className="text-[#17685E]"/> Venue: {p.venue}</span>
                    <span className="flex items-center gap-1"><IndianRupee size={14} className="text-emerald-500"/> Budget: ₹{p.estimated_budget}</span>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="min-w-[140px] flex flex-col items-center justify-center p-4 bg-[#FFFFFF] rounded-lg border border-slate-200">
                  {p.status === "approved" ? (
                    <>
                      <CheckCircle size={28} className="text-emerald-500 mb-2" />
                      <span className="text-emerald-500 font-semibold normal-case tracking-normal text-xs">Approved</span>
                    </>
                  ) : p.status === "rejected" ? (
                    <>
                      <XCircle size={28} className="text-rose-500 mb-2" />
                      <span className="text-rose-500 font-semibold normal-case tracking-normal text-xs">Rejected</span>
                    </>
                  ) : (
                    <>
                      <Clock size={28} className="text-amber-500 mb-2" />
                      <span className="text-amber-500 font-semibold normal-case tracking-normal text-xs">Pending</span>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="mt-3 w-8 h-8 flex items-center justify-center rounded-full bg-[#FFFFFF] border border-slate-200 text-slate-500 hover:text-rose-500 transition-all"
                        title="Delete Proposal"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>

              </motion.div>
            ))
          )}
        </motion.div>
      )}
    </div>
  );
}
