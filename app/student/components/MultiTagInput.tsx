"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface TagOption {
  id: string;
  name: string;
  subtitle?: string;
}

interface MultiTagInputProps {
  label: string;
  placeholder?: string;
  options: TagOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  accentColor?: string;
}

export default function MultiTagInput({
  label,
  placeholder = "Search...",
  options,
  selectedIds,
  onChange,
  accentColor = "#17685E"
}: MultiTagInputProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOptions = options.filter(opt => selectedIds.includes(opt.id));
  const availableOptions = options.filter(
    opt => !selectedIds.includes(opt.id) &&
           (opt.name.toLowerCase().includes(query.toLowerCase()) ||
            opt.id.toLowerCase().includes(query.toLowerCase()))
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (id: string) => {
    onChange([...selectedIds, id]);
    setQuery("");
    setIsOpen(false);
  };

  const handleRemove = (id: string) => {
    onChange(selectedIds.filter(selectedId => selectedId !== id));
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">
        {label}
      </label>

      <div className="bg-[#FFFFFF] border border-slate-200 rounded-lg p-3 flex flex-wrap gap-2 items-center relative min-h-[56px]">

        {/* Selected Tags */}
        {selectedOptions.map((opt) => (
          <motion.div
            initial={false} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
            key={opt.id}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FFFFFF] border border-slate-200"
          >
            <span className="text-sm font-bold text-slate-700">{opt.name}</span>
            <button
              type="button"
              onClick={() => handleRemove(opt.id)}
              className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-rose-100 hover:text-rose-500 text-slate-500 transition-colors"
            >
              <X size={12} strokeWidth={3} />
            </button>
          </motion.div>
        ))}

        {/* Search Input */}
        <div className="flex-1 min-w-[120px] flex items-center gap-2 px-2">
          <Search size={14} className="text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            placeholder={selectedIds.length === 0 ? placeholder : "Add more..."}
            className="w-full bg-transparent border-none outline-none text-sm text-slate-600 placeholder:text-slate-500"
          />
        </div>

        {/* Dropdown Menu */}
        <AnimatePresence>
          {isOpen && availableOptions.length > 0 && (
            <motion.div
              initial={false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="absolute top-[110%] left-0 right-0 bg-[#FFFFFF] border border-slate-200 rounded-lg z-50 max-h-60 overflow-y-auto custom-scrollbar overflow-hidden p-2 flex flex-col gap-1"
            >
              {availableOptions.map((opt) => (
                <button key={opt.id} type="button" onClick={() => handleSelect(opt.id)} className="w-full text-left px-4 py-3 rounded-lg hover:bg-white/50 transition-colors flex justify-between items-center group">
                  <span className="font-bold text-slate-700 group-hover:text-[#17685E] transition-colors">{opt.name}</span>
                  <span className="text-xs font-semibold text-slate-500">{opt.id} {opt.subtitle ? `• ${opt.subtitle}` : ''}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}