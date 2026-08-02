"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Compass, Home, AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F5F5F0] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      
      {/* Decorative Background Elements */}
      <div className="absolute top-[10%] left-[20%] w-72 h-72 bg-[#10B981] rounded-full mix-blend-multiply filter blur-[120px] opacity-5 animate-pulse" />
      <div className="absolute bottom-[20%] right-[15%] w-64 h-64 bg-emerald-400 rounded-full mix-blend-multiply filter blur-[100px] opacity-5" style={{ animation: "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite 2s" }} />
      
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 max-w-2xl w-full bg-white/40 backdrop-blur-2xl border border-white/60 p-10 md:p-16 rounded-[3rem] shadow-[8px_8px_30px_rgba(0,0,0,0.04),-8px_-8px_30px_rgba(255,255,255,0.8)] text-center flex flex-col items-center"
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -20 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
          className="w-24 h-24 bg-emerald-50 text-[#10B981] rounded-[2rem] flex items-center justify-center mb-8 shadow-[inset_4px_4px_8px_rgba(0,0,0,0.05),inset_-4px_-4px_8px_rgba(255,255,255,0.9)]"
        >
          <Compass size={48} strokeWidth={1.5} />
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-7xl md:text-9xl font-black text-slate-800 tracking-tighter mb-2"
          style={{ textShadow: "4px 4px 10px rgba(0,0,0,0.05)" }}
        >
          404
        </motion.h1>

        <motion.h2 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-2xl md:text-3xl font-bold text-slate-700 mb-4 tracking-tight"
        >
          Looks like you're lost on campus!
        </motion.h2>

        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-slate-500 mb-10 max-w-md mx-auto text-lg leading-relaxed"
        >
          We searched everywhere, but the page you are looking for has either been moved or doesn't exist.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="flex flex-col sm:flex-row gap-4 w-full justify-center"
        >
          <Link href="/" className="w-full sm:w-auto">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-[#10B981] text-white font-bold py-4 px-8 rounded-full shadow-lg shadow-[#10B981]/30 hover:shadow-[#10B981]/50 transition-all flex items-center justify-center gap-2 w-full"
            >
              <Home size={18} />
              Return Home
            </motion.div>
          </Link>
          
          <button onClick={() => window.history.back()} className="w-full sm:w-auto">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-white/80 text-slate-600 font-bold py-4 px-8 rounded-full shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 border border-slate-200/50 w-full"
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
