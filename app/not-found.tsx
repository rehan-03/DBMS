"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Compass, Home, AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FFFFFF] flex flex-col items-center justify-center p-6 relative overflow-hidden">

      {/* Decorative Background Elements */}
      <div className="absolute top-[10%] left-[20%] w-72 h-72 bg-[#10B981] rounded-full mix-blend-multiply filter blur-[120px] opacity-5 " />
      <div className="absolute bottom-[20%] right-[15%] w-64 h-64 bg-emerald-400 rounded-full mix-blend-multiply filter blur-[100px] opacity-5" style={{ animation: "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite 2s" }} />

      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 max-w-2xl w-full bg-white/40 -2xl border border-slate-200 p-10 md:p-16 rounded-lg border border-slate-200 text-center flex flex-col items-center"
      >
        <motion.div
          initial={false}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
          className="w-24 h-24 bg-emerald-50 text-[#10B981] rounded-lg flex items-center justify-center mb-8 border border-slate-200"
        >
          <Compass size={48} strokeWidth={1.5} />
        </motion.div>

        <motion.h1
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-7xl md:text-9xl font-semibold text-slate-800 tracking-tighter mb-2"
          style={{ textShadow: "4px 4px 10px rgba(0,0,0,0.05)" }}
        >
          404
        </motion.h1>

        <motion.h2
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-2xl md:text-3xl font-bold text-slate-700 mb-4 tracking-tight"
        >
          Looks like you're lost on campus!
        </motion.h2>

        <motion.p
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-slate-500 mb-10 max-w-md mx-auto text-lg leading-relaxed"
        >
          We searched everywhere, but the page you are looking for has either been moved or doesn't exist.
        </motion.p>

        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="flex flex-col sm:flex-row gap-4 w-full justify-center"
        >
          <Link href="/" className="w-full sm:w-auto">
            <motion.div
              className="bg-[#10B981] text-white font-bold py-4 px-8 rounded-full  border border-slate-200 transition-all flex items-center justify-center gap-2 w-full"
            >
              <Home size={18} />
              Return Home
            </motion.div>
          </Link>

          <button onClick={() => window.history.back()} className="w-full sm:w-auto">
            <motion.div
              className="bg-white/80 text-slate-600 font-bold py-4 px-8 rounded-full   transition-all flex items-center justify-center gap-2 border border-slate-200/50 w-full"
            >
              <AlertTriangle size={18} className="text-amber-500" />
              Go Back
            </motion.div>
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
