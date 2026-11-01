"use client";
import { signOut } from "next-auth/react";
import { getSession } from "@/lib/client-session";


import React, { useState, useEffect } from "react";
import { motion, Variants } from "framer-motion";
import { UserCircle, Lock, Shield, Building, Save } from "lucide-react";
import { supabase } from "@/app/student/supabase";
import { updatePassword } from "@/app/actions/users";
import { useRouter } from "next/navigation";
import { fetchStaffBySuid } from "@/app/actions/reads";

export default function StaffProfilePage() {
  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchStaffProfile = async () => {
      try {
        const suid = ((await getSession())?.user as any)?.uid;
        if (!suid) {
          router.replace("/");
          return;
        }

        const { data, error } = await fetchStaffBySuid(suid);

        if (error) {
          console.error("Fetch error:", error.message);
        }

        if (data) {
          console.log("1. Staff Data Loaded:", data);

          // Safely fetch department name separately to prevent breaking the entire profile
          const fkId = data.department_id || data.dept_id;

          if (fkId) {
            const { data: dept, error: deptError } = await supabase.from("departments").select("department_name").eq("department_id", fkId).maybeSingle();

            if (deptError) {
              console.error("2. Department Fetch Error:", deptError.message);
            } else if (dept) {
              console.log("3. Department Data Loaded:", dept);
              data.department_name_resolved = dept.department_name;
            } else {
              console.warn("2. No department matched ID:", fkId, "- This might be due to Row Level Security (RLS) blocking the read on the department table!");
            }
          }
          setProfileData(data);
        }
      } catch (error: any) {
        console.error("Error fetching staff profile:", error.message);
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchStaffProfile();
  }, []);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }

    setUpdatingPassword(true);
    try {
      const suid = ((await getSession())?.user as any)?.uid;
      if (!suid) throw new Error("Staff not found");

      await updatePassword("staff", newPassword);

      alert("Password updated successfully!");
      setNewPassword("");
    } catch (error: any) {
      alert("Error updating password: " + error.message);
    } finally {
      setUpdatingPassword(false);
    }
  };

  const containerVars = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVars: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="max-w-5xl mx-auto">

      {/* --- Header --- */}
      <div className="mb-10">
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-slate-800 tracking-tight">
          Profile & <span className="text-[#17685E]">Security</span>
        </h1>
        <p className="text-slate-500 mt-2">Manage your account credentials and workspace preferences.</p>
      </div>

      <motion.div
        variants={containerVars}
        initial={false}
        animate="show"
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8"
      >

        {/* --- Left Column: Profile Overview (Read-Only) --- */}
        <motion.div variants={itemVars} className="bg-[#FFFFFF] p-6 md:p-8 rounded-lg md:rounded-lg border border-slate-200 flex flex-col h-full">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 rounded-full bg-[#17685E]/10 text-[#17685E] flex items-center justify-center border border-slate-200">
              <UserCircle size={28} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-700">Faculty Profile</h3>
              <p className="text-xs text-slate-500 normal-case tracking-normal mt-1">Pre-seeded Data</p>
            </div>
          </div>

          <div className="space-y-5 flex-1">
            {/* Read-Only Field */}
            <div>
              <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4 mb-2 block">Full Name</label>
              <div className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-3 px-5 md:py-4 md:px-6 text-slate-600 font-medium">
                {loadingProfile ? "Loading..." : profileData?.name || "N/A"}
              </div>
            </div>

            {/* Read-Only Field */}
            <div>
              <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4 mb-2 block">Staff ID (UID)</label>
              <div className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-3 px-5 md:py-4 md:px-6 text-slate-600 font-medium flex items-center justify-between">
                {loadingProfile ? "Loading..." : profileData?.suid || "N/A"}
                <Shield size={16} className="text-[#17685E]" />
              </div>
            </div>

            {/* Read-Only Field */}
            <div>
              <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4 mb-2 block">Designation</label>
              <div className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-3 px-5 md:py-4 md:px-6 text-slate-600 font-medium">
                {loadingProfile ? "Loading..." : profileData?.designation || "N/A"}
              </div>
            </div>

            {/* Read-Only Field */}
            <div>
              <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4 mb-2 block">Department</label>
              <div className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-3 px-5 md:py-4 md:px-6 text-slate-600 font-medium flex items-center gap-2">
                <Building size={16} className="text-[#17685E]" />
                {loadingProfile ? "Loading..." : profileData?.department_name_resolved || profileData?.department || profileData?.dept || "N/A"}
              </div>
            </div>
          </div>
        </motion.div>

        {/* --- Right Column: Security & Preferences --- */}
        <div className="space-y-6 md:space-y-8 flex flex-col h-full">

          {/* Security / Password Reset */}
          <motion.div variants={itemVars} className="bg-[#FFFFFF] p-6 md:p-8 rounded-lg md:rounded-lg border border-slate-200 flex-1">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 rounded-full bg-[#8C6A31]/10 text-[#8C6A31] flex items-center justify-center border border-slate-200">
                <Lock size={28} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-700">Account Security</h3>
                <p className="text-xs text-rose-400 normal-case tracking-normal mt-1">Action Required</p>
              </div>
            </div>

            <form className="space-y-5" onSubmit={handlePasswordUpdate}>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 md:py-4 md:px-6 outline-none focus:ring-2 focus:ring-[#8C6A31]/30 transition-all text-slate-600 placeholder:text-slate-300 border-none"
                  placeholder="Enter secure password (min 6 chars)"
                />
              </div>

              <motion.button
                disabled={updatingPassword}
                type="submit"
                className="w-full bg-[#8C6A31] text-white font-bold py-3 md:py-4 rounded-full  border border-slate-200 transition-all flex items-center justify-center gap-2 mt-6 md:mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <Save size={20} /> {updatingPassword ? "Updating..." : "Update Credentials"}
              </motion.button>
            </form>
          </motion.div>
        </div>

      </motion.div>
    </div>
  );
}