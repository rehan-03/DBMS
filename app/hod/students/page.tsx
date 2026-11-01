"use client";
import { signOut } from "next-auth/react";
import { getSession } from "@/lib/client-session";


import React, { useState, useEffect, Suspense } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { Users, Search, UserCircle, GraduationCap, Shield, ChevronLeft, Activity, CheckCircle, Clock, XCircle, Mail, Phone } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/app/student/supabase";
import { startActivityRefresh } from "@/lib/activity-refresh";
import { fetchStudentByUid, fetchStudentsByDepartment, fetchMyHodProfile } from "@/app/actions/reads";

function HODStudentsDirectoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const drilldownUid = searchParams.get("id");

  // --- Directory State ---
  const [hodData, setHodData] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // --- Drilldown State ---
  const [drilldownStudent, setDrilldownStudent] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingDrilldown, setLoadingDrilldown] = useState(false);

  useEffect(() => {
    fetchDirectory();
  }, []);

  const fetchDirectory = async () => {
    try {
      const huid = ((await getSession())?.user as any)?.uid;
      if (!huid) return;

      // 1. Fetch HOD details to get their department_id
      const hod = await fetchMyHodProfile();

      if (hod) {
        setHodData(hod);

        // 2. Fetch all students in this department
        const { data: studentsData, error: studentsError } = await fetchStudentsByDepartment(String(hod.department_id));

        if (studentsError) {
          console.error("Error fetching students data:", studentsError);
          alert(`DB Error fetching students: ${studentsError}`);
        }

        // 3. Fetch academic years to resolve year_id safely
        const { data: yearsData } = await supabase.from("academic_years").select("*");
        const yearMap: Record<number, string> = {};
        if (yearsData) {
          yearsData.forEach((y: any) => {
            yearMap[y.year_id] = y.year_name;
          });
        }

        // Combine data
        const enrichedStudents = (studentsData || []).map((s: any) => ({
          ...s,
          year_name_resolved: yearMap[s.year_id] || s.year || s.academic_year || "Unknown Year"
        }));

        setStudents(enrichedStudents);
        setFilteredStudents(enrichedStudents);
      }
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (drilldownUid) {
      fetchDrilldown(drilldownUid);
      return startActivityRefresh(() => fetchDrilldown(drilldownUid, true));
    }
  }, [drilldownUid, students]);

  const fetchDrilldown = async (uid: string, background = false) => {
    if (!background) setLoadingDrilldown(true);
    try {
      const studentMatch = students.find(s => s.uid === uid);
      if (studentMatch) {
        setDrilldownStudent(studentMatch);
      } else {
        const data = await fetchStudentByUid(uid);
        if (data) setDrilldownStudent(data);
      }

      // 1. Fetch Old Singular Activities
      const { data: oldActivities } = await supabase
        .from("student_activities")
        .select("*")
        .eq("uid", uid);

      // 2. Fetch New Group Activities
      const { data: participations } = await supabase
        .from("activity_participants")
        .select(`status, group_activities ( id, title, description, created_at )`)
        .eq("student_uid", uid);

      const formattedOld = (oldActivities || []).map((a: any) => ({
        id: a.activity_id || a.id,
        title: a.activity_name,
        description: a.desc,
        created_at: a.created_at,
        status: a.status
      }));

      const formattedNew = (participations || []).map((p: any) => ({
        ...p.group_activities,
        status: p.status
      }));

      const combined = [...formattedOld, ...formattedNew].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setActivities(combined);
    } catch (error) {
      console.error("Error loading drilldown:", error);
    } finally {
      setLoadingDrilldown(false);
    }
  };

  // Handle real-time search filtering
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredStudents(students);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = students.filter(
      (s) =>
        (s.name && s.name.toLowerCase().includes(query)) ||
        (s.uid && s.uid.toLowerCase().includes(query))
    );
    setFilteredStudents(filtered);
  }, [searchQuery, students]);

  const containerVars = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } }
  };

  const itemVars: Variants = {
    hidden: { opacity: 0, scale: 0.95, y: 10 },
    show: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  if (loading && !drilldownUid) return <div className="text-slate-500 font-medium">Loading Student Directory...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">

      {drilldownUid ? (
        /* --- View: Drilldown Dossier --- */
        <motion.div initial={false} animate={{ opacity: 1, x: 0 }} className="space-y-8">
          <button onClick={() => router.push("/hod/students")} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#10B981] transition-colors">
            <ChevronLeft size={16} /> Back to Directory
          </button>

          <div className="bg-[#FFFFFF] p-8 rounded-lg border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h3 className="text-3xl font-bold text-slate-800">{drilldownStudent?.name || "Student"}</h3>
              <p className="text-[#10B981] font-bold tracking-wide mt-1 flex items-center gap-2">
                {drilldownUid} <span className="text-slate-300">•</span> Div {drilldownStudent?.division || "N/A"}
              </p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-4 text-sm font-medium text-slate-500">
                {drilldownStudent?.email && <span className="flex items-center gap-2"><Mail size={14} className="text-slate-500" /> {drilldownStudent.email}</span>}
                {drilldownStudent?.phone && <span className="flex items-center gap-2"><Phone size={14} className="text-slate-500" /> {drilldownStudent.phone}</span>}
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-center px-6 py-3 bg-[#FFFFFF] border border-slate-200 rounded-lg min-w-[110px]">
                <p className="text-xs normal-case tracking-normal text-slate-500 font-bold">Total Logs</p>
                <p className="text-2xl font-semibold text-slate-700">{activities.length}</p>
              </div>
            </div>
          </div>

          <h3 className="text-xl font-bold text-slate-700 flex items-center gap-2">
            <Activity size={20} className="text-[#10B981]" /> Activity Timeline
          </h3>

          {loadingDrilldown ? (
            <p className="text-slate-500">Loading timeline...</p>
          ) : activities.length === 0 ? (
            <div className="bg-[#FFFFFF] p-12 rounded-lg text-center border border-slate-200">
              <p className="text-slate-500 font-medium">This student has not logged any activities yet.</p>
            </div>
          ) : (
            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-[#10B981] before:to-transparent">
              {activities.map((act) => (
                <div key={act.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#FFFFFF] bg-[#10B981] text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    {act.status === "Approved" ? <CheckCircle size={16} /> : act.status === "Rejected" ? <XCircle size={16} /> : <Clock size={16} />}
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-[#FFFFFF] p-5 rounded-lg border border-slate-200">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-slate-700">{act.title}</h4>
                      <span className={`text-xs font-semibold normal-case tracking-normal px-3 py-1 rounded-full ${act.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : act.status === 'Rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                        {act.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mb-3 flex items-center gap-1">
                      <Clock size={12} /> {new Date(act.created_at).toLocaleDateString()}
                    </p>
                    {act.description && <p className="text-sm text-slate-600 line-clamp-2">{act.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      ) : (
        /* --- View: Directory Grid --- */
        <motion.div initial={false} animate={{ opacity: 1 }} className="space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <motion.div initial={false} animate={{ opacity: 1, x: 0 }}>
              <h1 className="text-3xl md:text-4xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                <Users className="text-[#10B981]" size={36} />
                Student <span className="text-[#10B981]">Directory</span>
              </h1>
              <p className="text-slate-500 mt-2">
                Viewing all {students.length} students in your department.
              </p>
            </motion.div>

            {/* Search Bar */}
            <motion.div initial={false} animate={{ opacity: 1, x: 0 }} className="w-full md:w-80 relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                <Search size={18} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or UID..."
                className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 pl-12 pr-5 outline-none focus:ring-2 focus:ring-[#10B981]/30 transition-all text-slate-600 placeholder:text-slate-500 border-none font-medium"
              />
            </motion.div>
          </div>

          {/* --- Student Grid --- */}
          {filteredStudents.length === 0 ? (
            <div className="bg-[#FFFFFF] p-12 rounded-lg border border-slate-200 text-center text-slate-500 font-medium">
              No students found matching "{searchQuery}".
            </div>
          ) : (
            <motion.div variants={containerVars} initial={false} animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredStudents.map((student) => (
                <motion.div key={student.uid} variants={itemVars} className="bg-[#FFFFFF] p-6 rounded-lg border border-slate-200 flex flex-col items-center text-center group border border-slate-200 transition-all">
                  <div className="w-16 h-16 rounded-full bg-[#10B981]/10 text-[#10B981] flex items-center justify-center border border-slate-200 mb-4">
                    <UserCircle size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 line-clamp-1 w-full" title={student.name}>{student.name}</h3>
                  <div className="flex items-center justify-center gap-1 text-xs font-bold text-slate-500 tracking-normal mt-1 mb-4">
                    <Shield size={12} className="text-[#10B981]" /> {student.uid}
                  </div>

                  <div className="mt-auto w-full pt-4 border-t border-slate-200/50 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs font-bold normal-case tracking-normal bg-slate-200/50 text-slate-500 px-3 py-1.5 rounded-full">
                      <GraduationCap size={12} /> {student.year_name_resolved}
                    </span>
                    <button onClick={() => router.push(`/hod/students?id=${student.uid}`)} className="text-xs font-bold text-slate-500 hover:text-[#10B981] transition-colors flex items-center gap-1">
                      <Activity size={14}/> View Logs
                    </button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}

export default function HODStudentsDirectory() {
  return (
    <Suspense fallback={<div className="text-slate-500 font-medium p-8 text-center">Loading Directory...</div>}>
      <HODStudentsDirectoryContent />
    </Suspense>
  );
}
