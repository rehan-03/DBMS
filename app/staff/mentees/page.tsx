"use client";
import { signOut } from "next-auth/react";
import { getSession } from "@/lib/client-session";


import React, { useState, useEffect, Suspense } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { Users, Plus, Edit, ChevronLeft, Activity, CheckCircle, Clock, XCircle, FileSpreadsheet, X, Search, Download, Trash2 } from "lucide-react";
import { supabase } from "@/app/student/supabase";
import { startActivityRefresh } from "@/lib/activity-refresh";
import { upsertStudent, deleteStudent } from "@/app/actions/users";
import { fetchMyStaffProfile, fetchStudentsByDepartment } from "@/app/actions/reads";
import { useSearchParams, useRouter } from "next/navigation";
import * as XLSX from "xlsx";

function MenteeManagementContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const drilldownUid = searchParams.get("id");

  const [staffData, setStaffData] = useState<any>(null);
  const [myDivisions, setMyDivisions] = useState<string[]>([]);
  const [mentees, setMentees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [formData, setFormData] = useState({
    uid: "",
    name: "",
    dob: "",
    gender: "",
    division: "",
    semester: "" as number | "",
    year_id: "",
    password: "",
    batch: "",
  });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPayload, setImportPayload] = useState<any[]>([]);

  // Drilldown State
  const [studentActivities, setStudentActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [drilldownStudent, setDrilldownStudent] = useState<any>(null);

  useEffect(() => {
    fetchMentees();
  }, []);

  useEffect(() => {
    if (drilldownUid) {
      fetchStudentDrilldown(drilldownUid);
      return startActivityRefresh(() => fetchStudentDrilldown(drilldownUid, true));
    }
  }, [drilldownUid, mentees]);

  const fetchMentees = async () => {
    setLoading(true);
    try {
      const suid = ((await getSession())?.user as any)?.uid;
      if (!suid) return;

      const staff = await fetchMyStaffProfile();
      if (staff) {
        setStaffData(staff);

        // Fetch divisions this staff coordinates
        const { data: coords } = await supabase.from("class_coordinators").select("division").eq("suid", suid);
        const divisions = coords?.map((c: any) => c.division) || [];
        setMyDivisions(divisions);

        const { data: students, error: studentsError } = await fetchStudentsByDepartment(String(staff.department_id));
        if (studentsError) {
          console.error("Error fetching mentees:", studentsError);
        } else if (students) {
          setMentees(students);
        }
      }
    } catch (error) {
      console.error("Error fetching mentees:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentDrilldown = async (uid: string, background = false) => {
    if (!background) setLoadingActivities(true);
    const student = mentees.find(m => m.uid === uid);
    if (student) setDrilldownStudent(student);

    try {
      const { data: participations } = await supabase
        .from("activity_participants")
        .select(`
          status,
          group_activities ( id, title, description, created_at )
        `)
        .eq("student_uid", uid);

      if (participations) {
        const acts = participations.map((p: any) => ({
          id: p.group_activities?.id || Math.random().toString(),
          title: p.group_activities?.title || 'Unknown Activity',
          description: p.group_activities?.description || '',
          status: p.status,
          created_at: p.group_activities?.created_at || new Date().toISOString()
        })).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setStudentActivities(acts);
      }
    } catch (error) {
      console.error("Error fetching activities:", error);
    } finally {
      setLoadingActivities(false);
    }
  };

  // --- Manual Add/Edit Logic ---
  const handleOpenModal = (student: any = null) => {
    if (student) {
      setEditingStudent(student);
      setFormData({
        uid: student.uid,
        name: student.name,
        division: student.division || "",
        dob: student.dob ? new Date(student.dob).toISOString().split('T')[0] : "",
        gender: student.gender || "",
        semester: student.semester || "",
        year_id: student.year_id || "",
        password: "", // Don't show existing password for security
        batch: student.batch || "",
      });
    } else {
      setEditingStudent(null);
      setFormData({
        uid: "", name: "", division: myDivisions[0] || "", dob: "",
        gender: "", semester: "", year_id: "", password: "",
        batch: "",
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...formData, // uid, name, dob, gender, division, semester, year_id, batch, password
        uid: formData.uid.trim().toUpperCase(),
        department_id: String(staffData.department_id),
      };

      // Don't update password if it's empty during an edit
      if (editingStudent && !payload.password) {
        delete (payload as any).password;
      }

      // Clean up empty fields so they are stored as NULL
      for (const key in payload) {
        if ((payload as any)[key] === "") {
          (payload as any)[key] = null;
        }
      }

      if (payload.semester) {
        payload.semester = parseInt(String(payload.semester), 10);
      }

      await upsertStudent(payload);

      await fetchMentees();
      setIsModalOpen(false);
    } catch (error: any) {
      alert("Error saving student: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // --- Delete Student Logic ---
  const handleDeleteStudent = (uid: string) => {
    setStudentToDelete(uid);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    setDeleting(true);
    try {
      await deleteStudent(studentToDelete);

      await fetchMentees();
      setIsDeleteModalOpen(false);
      setStudentToDelete(null);
    } catch (error: any) {
      alert("Error deleting student: " + error.message);
    } finally {
      setDeleting(false);
    }
  };

  // --- Download Template Logic ---
  const handleDownloadTemplate = () => {
    const headers = ["UID", "Name", "DOB", "Gender", "Division", "Semester", "Year_ID", "Batch", "Password"];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students Template");
    XLSX.writeFile(wb, "student_import_template.xlsx");
  };
  // --- Bulk Import Logic ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const payload = jsonData.map((row: any) => {
        const studentData: any = {
          uid: String(row.UID || row.uid || '').trim().toUpperCase(),
          name: String(row.Name || row.name || '').trim(),
          division: String(row.Division || row.division || myDivisions[0] || "A").trim(),
          department_id: String(staffData.department_id),
          dob: row.DOB || null,
          gender: row.Gender || null,
          semester: row.Semester ? parseInt(String(row.Semester), 10) : null,
          year_id: row.Year_ID || null,
          batch: row.Batch || null,
        };

        if (row.Password && String(row.Password).length > 0) {
          studentData.password = String(row.Password);
        }

        // Clean up empty strings to be null
        for (const key in studentData) {
            if (studentData[key] === '') studentData[key] = null;
        }
        return studentData;
      }).filter(s => s.uid && s.name);

      if (payload.length === 0) {
        alert("No valid rows found. Please ensure your Excel sheet has at least 'UID' and 'Name' columns, and matches the template format.");
        return;
      }

      setImportPayload(payload);
      setIsImportModalOpen(true);
    } catch (error: any) {
      alert("Error parsing file: " + error.message);
    } finally {
      setImporting(false);
      e.target.value = ""; // Reset input
    }
  };

  const confirmImport = async () => {
    setImporting(true);
    try {
      await upsertStudent(importPayload);

      alert(`Successfully imported/updated ${importPayload.length} students!`);
      await fetchMentees();
      setIsImportModalOpen(false);
      setImportPayload([]);
    } catch (error: any) {
      alert("Error importing data: " + error.message);
    } finally {
      setImporting(false);
    }
  };

  const filteredMentees = mentees.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.uid.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const containerVars: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } }
  };

  const itemVars: Variants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
  };

  if (loading) return <div className="text-slate-500 font-medium">Loading Roster...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8">

      {/* --- View: Drilldown --- */}
      {drilldownUid ? (
        <motion.div initial={false} animate={{ opacity: 1, x: 0 }} className="space-y-8">
          <button
            onClick={() => router.push("/staff/mentees")}
            className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#17685E] transition-colors"
          >
            <ChevronLeft size={16} /> Back to Roster
          </button>

          <div className="bg-[#FFFFFF] p-8 rounded-lg border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-800">{drilldownStudent?.name || "Student"}</h1>
              <p className="text-[#17685E] font-medium tracking-wide mt-1">{drilldownUid} • Division {drilldownStudent?.division}</p>
            </div>
            <div className="flex gap-4">
              <div className="text-center px-6 py-3 bg-[#FFFFFF] border border-slate-200 rounded-lg">
                <p className="text-xs normal-case tracking-normal text-slate-500 font-bold">Total Logs</p>
                <p className="text-xl font-bold text-slate-700">{studentActivities.length}</p>
              </div>
            </div>
          </div>

          <h3 className="text-xl font-bold text-slate-700 flex items-center gap-2">
            <Activity size={20} className="text-[#17685E]" /> Activity Timeline
          </h3>

          {loadingActivities ? (
             <p className="text-slate-500">Loading timeline...</p>
          ) : studentActivities.length === 0 ? (
            <div className="bg-[#FFFFFF] p-12 rounded-lg text-center border border-slate-200">
              <p className="text-slate-500 font-medium">This student has not logged any activities yet.</p>
            </div>
          ) : (
            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-[#17685E] before:to-transparent">
              {studentActivities.map((act) => (
                <div key={act.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#FFFFFF] bg-[#17685E] text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
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
                    <p className="text-sm text-slate-600 line-clamp-2">{act.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      ) : (
        /* --- View: Roster --- */
        <motion.div initial={false} animate={{ opacity: 1 }} className="space-y-8">

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                <Users className="text-[#17685E]" size={36} /> Mentee <span className="text-[#17685E]">Management</span>
              </h2>
              <p className="text-slate-500 mt-2">Manage your assigned students and track their engagement.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button onClick={handleDownloadTemplate} className="bg-[#FFFFFF] text-slate-600 px-5 py-3 rounded-full font-semibold border border-slate-200 hover:text-emerald-500 transition-colors flex items-center gap-2">
                <Download size={18} /> Download Template
              </button>
              <label className="cursor-pointer bg-[#FFFFFF] text-slate-600 px-5 py-3 rounded-full font-semibold border border-slate-200 hover:text-emerald-500 transition-colors flex items-center gap-2 relative">
                <FileSpreadsheet size={18} />
                {importing ? "Importing..." : "Import .xlsx"}
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" disabled={importing} />
              </label>
              <button
                onClick={() => handleOpenModal()}
                className="bg-[#17685E] text-white px-5 py-3 rounded-full font-semibold  border border-slate-200 transition-all flex items-center gap-2"
              >
                <Plus size={18} /> Add Mentee
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative max-w-md">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500">
              <Search size={18} />
            </div>
            <input
              type="text"
              placeholder="Search by name or UID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 pl-12 pr-6 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-sm text-slate-600 border-none"
            />
          </div>

          {/* Roster Grid */}
          <motion.div variants={containerVars} initial={false} animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMentees.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 font-medium">No students found.</div>
            )}
            {filteredMentees.map((student) => {
              const isMyMentee = myDivisions.includes(student.division);
              return (
                <motion.div
                  variants={itemVars} key={student.uid}
                  className={`p-6 rounded-lg bg-[#FFFFFF] border border-slate-200 relative group transition-all ${isMyMentee ? 'border border-slate-200' : 'opacity-70 grayscale-[0.5]'}`}
                >
                  {!isMyMentee && <span className="absolute top-4 right-4 text-xs font-bold text-slate-500 normal-case">Other Div</span>}

                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-slate-700">{student.name}</h3>
                    <p className="text-sm font-medium text-[#17685E]">{student.uid}</p>
                  </div>

                  <div className="flex gap-2 mb-6">
                    <span className="text-xs font-bold normal-case tracking-normal bg-slate-200 text-slate-500 px-3 py-1 rounded-full">Div {student.division || "N/A"}</span>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-200/50">
                    <button onClick={() => router.push(`/staff/mentees?id=${student.uid}`)} className="text-xs font-bold text-slate-500 hover:text-[#17685E] transition-colors flex items-center gap-1">
                      <Activity size={14}/> View Logs
                    </button>
                    <div className="flex gap-2">
                      <button onClick={() => handleOpenModal(student)} title="Edit Student" className="w-8 h-8 rounded-full bg-[#FFFFFF] border border-slate-200 flex items-center justify-center text-slate-500 hover:text-amber-500 transition-all">
                        <Edit size={14} />
                      </button>
                      <button onClick={() => handleDeleteStudent(student.uid)} title="Delete Student" className="w-8 h-8 rounded-full bg-[#FFFFFF] border border-slate-200 flex items-center justify-center text-slate-500 hover:text-rose-500 transition-all">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </motion.div>
      )}

      {/* --- Add/Edit Modal --- */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/20  z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={false} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[#FFFFFF] p-8 rounded-lg  border border-slate-200 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-bold text-slate-800">{editingStudent ? "Edit Student" : "Add Mentee"}</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-rose-500">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSaveStudent} className="space-y-5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">UID</label>
                  <input required disabled={!!editingStudent} type="text" value={formData.uid} onChange={e => setFormData({...formData, uid: e.target.value.toUpperCase()})} placeholder="e.g. 322CE001" className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 disabled:opacity-50 border-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Full Name</label>
                  <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Student's full name" className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Date of Birth</label>
                    <input type="date" value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Gender</label>
                    <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none appearance-none">
                      <option value="">Select...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Division</label>
                    <input required type="text" value={formData.division} onChange={e => setFormData({...formData, division: e.target.value})} placeholder="e.g. A" className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Semester</label>
                    <input type="number" value={formData.semester} onChange={e => setFormData({...formData, semester: e.target.value ? parseInt(e.target.value) : ""})} placeholder="e.g. 4" className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Year ID</label>
                    <input type="text" value={formData.year_id} onChange={e => setFormData({...formData, year_id: e.target.value})} placeholder="e.g. SE" className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Batch</label>
                    <input type="text" value={formData.batch} onChange={e => setFormData({...formData, batch: e.target.value})} placeholder="e.g. 2022-2026" className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Password</label>
                  <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder={editingStudent ? "Leave blank to keep unchanged" : "Set initial password"} className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#17685E]/30 transition-all text-slate-600 border-none" />
                </div>
                <motion.button disabled={saving} type="submit" className="w-full bg-[#17685E] text-white font-bold py-4 rounded-full  border border-slate-200 transition-all mt-6">
                  {saving ? "Saving..." : "Save Student"}
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Delete Confirmation Modal --- */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <motion.div
            initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/20  z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={false} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[#FFFFFF] p-8 rounded-lg  border border-slate-200 w-full max-w-md text-center"
            >
              <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Delete Student?</h3>
              <p className="text-slate-500 mb-8">
                Are you sure you want to delete student <span className="font-bold text-slate-700">{studentToDelete}</span>? This action cannot be undone.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={deleting}
                  className="flex-1 bg-white text-slate-600 font-bold py-4 rounded-full  hover:bg-slate-50 transition-all border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteStudent}
                  disabled={deleting}
                  className="flex-1 bg-rose-500 text-white font-bold py-4 rounded-full    transition-all"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Import Confirmation Modal --- */}
      <AnimatePresence>
        {isImportModalOpen && (
          <motion.div
            initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/20  z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={false} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[#FFFFFF] p-8 rounded-lg  border border-slate-200 w-full max-w-2xl text-center"
            >
              <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileSpreadsheet size={32} />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Confirm Import</h3>
              <p className="text-slate-500 mb-4">
                You are about to import or update <span className="font-bold text-slate-700">{importPayload.length}</span> students from the selected file. Do you want to proceed?
              </p>

              {importPayload.length > 0 && (
                <div className="mt-4 mb-8 text-left bg-white/50 rounded-lg overflow-hidden border border-slate-200/60 border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-slate-600">
                      <thead className="bg-[#FFFFFF] border-b border-slate-200/60 text-slate-500 font-bold normal-case tracking-normal text-xs">
                        <tr>
                          <th className="px-4 py-3 text-left">UID</th>
                          <th className="px-4 py-3 text-left">Name</th>
                          <th className="px-4 py-3 text-left">Division</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/50">
                        {importPayload.slice(0, 5).map((student, idx) => (
                          <tr key={idx} className="hover:bg-white/40 transition-colors">
                            <td className="px-4 py-3 font-bold text-[#17685E]">{student.uid}</td>
                            <td className="px-4 py-3 font-medium">{student.name}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full text-xs font-bold normal-case">{student.division || '-'}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importPayload.length > 5 && (
                    <div className="px-4 py-3 bg-[#FFFFFF]/50 text-xs text-center text-slate-500 font-semibold border-t border-slate-200/60">
                      ... and {importPayload.length - 5} more students
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportPayload([]);
                  }}
                  disabled={importing}
                  className="flex-1 bg-white text-slate-600 font-bold py-4 rounded-full  hover:bg-slate-50 transition-all border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmImport}
                  disabled={importing}
                  className="flex-1 bg-emerald-500 text-white font-bold py-4 rounded-full    transition-all"
                >
                  {importing ? "Importing..." : "Confirm"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function MenteeManagementPage() {
  return (
    <Suspense fallback={<div className="text-slate-500 font-medium p-8 text-center">Loading Roster...</div>}>
      <MenteeManagementContent />
    </Suspense>
  );
}
