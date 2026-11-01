"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Shield, Lock, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // TEMPORARY LOGIC: Hardcoded Admin bypass
    setTimeout(() => {
      if (adminId === "admin" && password === "admin123") {
        router.push("/admin");
      } else {
        setLoading(false);
        alert("Invalid Admin Credentials.");
      }
    }, 800);
  };

  return (
    <main className="min-h-screen bg-[#FFFFFF] flex items-center justify-center p-6 overflow-hidden">
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-[#FFFFFF] p-10 rounded-lg border border-slate-200 relative">

          <div className="text-center mb-10">
            <div className="mx-auto w-16 h-16 bg-[#8C6A31]/20 text-[#8C6A31] rounded-full flex items-center justify-center mb-4 border border-slate-200">
              <Shield size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-700">Admin Portal</h1>
            <p className="text-slate-500 text-sm mt-2">Restricted System Access</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {/* Admin ID Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Admin ID</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                  <Shield size={18} />
                </div>
                <input
                  type="text"
                  value={adminId}
                  onChange={(e) => setAdminId(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-[#8C6A31]/30 transition-all text-slate-600 placeholder:text-slate-300 border-none"
                  placeholder="Enter Admin ID"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Password</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-[#8C6A31]/30 transition-all text-slate-600 placeholder:text-slate-300 border-none"
                  placeholder="Enter password"
                  required
                />
              </div>
            </div>

            <motion.button
              disabled={loading}
              className="w-full bg-[#8C6A31] text-white font-bold py-4 rounded-full  border border-slate-200 transition-all flex items-center justify-center gap-2 mt-4"
            >
              {loading ? "Authenticating..." : "Login to Dashboard"}
              <ArrowRight size={20} />
            </motion.button>
          </form>
        </div>
      </motion.div>
    </main>
  );
}