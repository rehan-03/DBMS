"use client";
import { signOut } from "next-auth/react";
import { getSession } from "@/lib/client-session";


import React, { useState, useEffect } from "react";
import { motion, Variants, AnimatePresence } from "framer-motion";
import { Megaphone, Send, Clock, Users, CheckCircle2, Paperclip, X, Link as LinkIcon, Image as ImageIcon, FileText, ExternalLink, Pin, AlertCircle, CalendarClock, ListChecks, Trash2 } from "lucide-react";
import { supabase } from "@/app/student/supabase";
import { createBroadcast, deleteBroadcast } from "@/app/actions/broadcasts";
import { fetchMyHodProfile } from "@/app/actions/reads";

export default function BroadcastsPage() {
  const [hodData, setHodData] = useState<any>(null);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("all");
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [linkInput, setLinkInput] = useState("");

  // New features state
  const [urgency, setUrgency] = useState("normal");
  const [isPinned, setIsPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [hasRsvp, setHasRsvp] = useState(false);
  const [rsvpOptions, setRsvpOptions] = useState("Yes, No");

  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const huid = ((await getSession())?.user as any)?.uid;
      if (!huid) return;

      // Fetch HOD details
      const hod = await fetchMyHodProfile();

      if (hod) {
        setHodData(hod);

        // Fetch past broadcasts for this department
        const { data: pastBroadcasts } = await supabase
          .from("broadcasts")
          .select("*")
          .eq("department_id", hod.department_id)
          .order("created_at", { ascending: false });

        if (pastBroadcasts) setBroadcasts(pastBroadcasts);
      }
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLink = () => {
    if (linkInput.trim() && !links.includes(linkInput.trim())) {
      setLinks([...links, linkInput.trim()]);
      setLinkInput("");
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const removeLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hodData) {
      showToast("HOD profile not loaded correctly. Please refresh the page.", "error");
      return;
    }

    if (!title.trim() || !message.trim()) {
      showToast("Please fill out both the title and message.", "error");
      return;
    }

    setSending(true);
    try {
      // 1. Upload files first
      const uploadedAttachments: any[] = [];

      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}-${Date.now()}.${fileExt}`;
        const filePath = `${hodData.department_id}/${fileName}`;

        // Ensure you have a 'broadcast_attachments' bucket in Supabase storage, or change 'broadcasts' to your bucket name
        const { error: uploadError } = await supabase.storage
          .from("broadcasts")
          .upload(filePath, file);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          continue; // Skip failed uploads but continue with broadcast
        }

        const { data: { publicUrl } } = supabase.storage
          .from("broadcasts")
          .getPublicUrl(filePath);

        uploadedAttachments.push({
          type: file.type.startsWith('image/') ? 'image' : 'pdf',
          url: publicUrl,
          name: file.name
        });
      }

      // 2. Add links
      links.forEach(link => {
        uploadedAttachments.push({
          type: 'link',
          url: link,
          name: link
        });
      });

      const newBroadcast = {
        title,
        message,
        target_audience: audience,
        department_id: hodData.department_id,
        created_by: hodData.huid,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : null,
        urgency,
        is_pinned: isPinned,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        has_rsvp: hasRsvp,
        rsvp_options: hasRsvp ? rsvpOptions.split(',').map(s => s.trim()).filter(Boolean) : null
      };

      const result = await createBroadcast(newBroadcast);

      if (!result.success) {
        throw new Error(result.error || "An unknown error occurred on the server.");
      }

      if (result.success && result.data) {
        // Add new broadcast to the top of the local list
        setBroadcasts([result.data, ...broadcasts].sort((a,b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)));
      }

      // Reset form
      setTitle("");
      setMessage("");
      setAudience("all");
      setFiles([]);
      setLinks([]);
      setLinkInput("");
      setUrgency("normal");
      setIsPinned(false);
      setExpiresAt("");
      setHasRsvp(false);
      setRsvpOptions("Yes, No");

      showToast("Broadcast sent successfully!", "success");

    } catch (error: any) {
      showToast("Error sending broadcast: " + error.message, "error");
    } finally {
      setSending(false);
    }
  };

  const handleDeleteBroadcast = async (broadcastId: string) => {
    if (!confirm("Are you sure you want to delete this broadcast? This action cannot be undone.")) return;

    setSending(true);
    try {
      const result = await deleteBroadcast(broadcastId);
      if (!result.success) throw new Error(result.error || "Failed to delete broadcast");

      setBroadcasts(broadcasts.filter(b => b.id !== broadcastId));
      showToast("Broadcast deleted successfully!", "success");
    } catch (error: any) {
      showToast("Error deleting broadcast: " + error.message, "error");
    } finally {
      setSending(false);
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

  if (loading) return <div className="text-slate-500 font-medium">Loading Broadcast Center...</div>;
  if (!hodData) return <div className="text-rose-500 font-medium">Error: HOD Profile not found. Please log in again.</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-10 relative">

      {/* --- Toast Notification --- */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-lg  border ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 size={24} className="text-emerald-500" /> : <AlertCircle size={24} className="text-rose-500" />}
            <span className="font-medium text-sm pr-4">{toast.message}</span>
            <button onClick={() => setToast(null)} className="absolute top-2 right-2 text-slate-500 hover:text-slate-700">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Header --- */}
      <motion.div initial={false} animate={{ opacity: 1, x: 0 }} className="mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
          <Megaphone className="text-[#10B981]" size={36} />
          Department <span className="text-[#10B981]">Broadcasts</span>
        </h1>
        <p className="text-slate-500 mt-2">Publish official notices and announcements to your department.</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">

        {/* --- Left Column: Composer --- */}
        <motion.div initial={false} animate={{ opacity: 1, y: 0 }} className="lg:col-span-5 space-y-6">
          <div className="bg-[#FFFFFF] p-8 rounded-lg border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                Composer <span className="w-2 h-2 rounded-full bg-[#10B981] "></span>
              </h3>
              <label className="flex items-center cursor-pointer gap-2 text-xs font-bold text-slate-500 normal-case tracking-normal">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="w-4 h-4 text-[#10B981] bg-white border-none rounded focus:ring-[#10B981]"
                />
                Pin to Top <Pin size={14} className={isPinned ? "text-[#10B981]" : "text-slate-500"} />
              </label>
            </div>

            <form onSubmit={handleSendBroadcast} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Target Audience</label>
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#10B981]/30 transition-all text-slate-600 font-medium appearance-none border-none cursor-pointer"
                  >
                    <option value="all">Everyone</option>
                    <option value="students">Students Only</option>
                    <option value="staff">Staff Only</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Urgency Level</label>
                  <select
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value)}
                    className={`w-full border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 transition-all font-medium appearance-none border-none cursor-pointer ${
                      urgency === 'urgent' ? 'bg-red-50 text-red-600 focus:ring-red-500/30' :
                      urgency === 'important' ? 'bg-amber-50 text-amber-600 focus:ring-amber-500/30' :
                      'bg-[#FFFFFF] text-slate-600 focus:ring-[#10B981]/30'
                    }`}
                  >
                    <option value="normal">🟢 Normal</option>
                    <option value="important">🟠 Important</option>
                    <option value="urgent">🔴 Urgent</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Notice Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. End Semester Exam Schedule"
                  className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 outline-none focus:ring-2 focus:ring-[#10B981]/30 transition-all text-slate-600 placeholder:text-slate-500 border-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your official notice here..."
                  rows={5}
                  className="w-full bg-[#FFFFFF] border border-slate-200 rounded-lg py-4 px-5 outline-none focus:ring-2 focus:ring-[#10B981]/30 transition-all text-slate-600 placeholder:text-slate-500 resize-none border-none"
                />
              </div>

              <div className="space-y-4 pt-2">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Attachments (Images, PDFs, Links)</label>

                {/* File Upload UI */}
                <div className="flex gap-2 items-center">
                  <label htmlFor="file-upload" className="cursor-pointer bg-[#FFFFFF] border border-slate-200 rounded-full py-3 px-5 hover:bg-emerald-50 transition-colors flex items-center gap-2 text-slate-600 font-medium">
                    <Paperclip size={18} className="text-[#10B981]" />
                    Attach Files
                  </label>
                  <input
                    id="file-upload"
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        setFiles([...files, ...Array.from(e.target.files)]);
                      }
                    }}
                  />

                  {/* Link Insert UI */}
                  <div className="flex bg-[#FFFFFF] border border-slate-200 rounded-full flex-1 overflow-hidden">
                    <input
                      type="url"
                      value={linkInput}
                      onChange={(e) => setLinkInput(e.target.value)}
                      placeholder="Add a URL link..."
                      className="flex-1 bg-transparent py-3 px-5 outline-none text-slate-600 placeholder:text-slate-500 border-none"
                    />
                    <button type="button" onClick={handleAddLink} className="px-4 text-[#10B981] font-bold hover:bg-black/5 transition-colors">
                      Add
                    </button>
                  </div>
                </div>

                {/* Previews */}
                {(files.length > 0 || links.length > 0) && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    <AnimatePresence>
                      {files.map((f, idx) => (
                        <motion.div key={`file-${idx}`} initial={false} animate={{opacity:1, scale:1}} exit={{opacity:0, scale:0.8}} className="bg-white/80 border border-emerald-100 px-3 py-1.5 rounded-lg flex items-center gap-2  text-sm">
                          {f.type.startsWith('image/') ? <ImageIcon size={14} className="text-emerald-500"/> : <FileText size={14} className="text-rose-500"/>}
                          <span className="text-slate-700 font-medium truncate max-w-[120px]">{f.name}</span>
                          <button type="button" onClick={() => removeFile(idx)} className="text-slate-500 hover:text-red-500 ml-1"><X size={14}/></button>
                        </motion.div>
                      ))}
                      {links.map((l, idx) => (
                        <motion.div key={`link-${idx}`} initial={false} animate={{opacity:1, scale:1}} exit={{opacity:0, scale:0.8}} className="bg-white/80 border border-emerald-100 px-3 py-1.5 rounded-lg flex items-center gap-2  text-sm">
                          <LinkIcon size={14} className="text-blue-500"/>
                          <span className="text-slate-700 font-medium truncate max-w-[120px]">{l}</span>
                          <button type="button" onClick={() => removeLink(idx)} className="text-slate-500 hover:text-red-500 ml-1"><X size={14}/></button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              <div className="space-y-4 pt-2 border-t border-black/5 mt-4">
                <label className="text-xs font-bold text-slate-500 normal-case tracking-normal ml-4">Expiration & Polling</label>

                <div className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <label className="text-xs font-bold text-slate-500 capitalize ml-2">Auto-Expire On (Optional)</label>
                    <div className="flex bg-[#FFFFFF] border border-slate-200 rounded-full items-center px-4">
                      <CalendarClock size={16} className="text-slate-500" />
                      <input
                        type="datetime-local"
                        value={expiresAt}
                        onChange={(e) => setExpiresAt(e.target.value)}
                        className="flex-1 bg-transparent py-3 px-3 outline-none text-slate-600 border-none text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center cursor-pointer gap-2 text-xs font-bold text-slate-500 normal-case tracking-normal ml-2">
                    <input
                      type="checkbox"
                      checked={hasRsvp}
                      onChange={(e) => setHasRsvp(e.target.checked)}
                      className="w-4 h-4 text-[#10B981] bg-white border-none rounded focus:ring-[#10B981]"
                    />
                    Add a Quick Poll / RSVP <ListChecks size={14} className="text-[#10B981]" />
                  </label>

                  {hasRsvp && (
                    <motion.div initial={false} animate={{opacity:1, height:'auto'}} className="pl-6 pb-2">
                      <input
                        type="text"
                        value={rsvpOptions}
                        onChange={(e) => setRsvpOptions(e.target.value)}
                        placeholder="Comma separated options (e.g. Yes, No, Maybe)"
                        className="w-full bg-[#FFFFFF] border border-slate-200 rounded-full py-2.5 px-5 outline-none focus:ring-2 focus:ring-[#10B981]/30 transition-all text-slate-600 text-sm border-none"
                      />
                    </motion.div>
                  )}
                </div>
              </div>

              <motion.button disabled={sending} type="submit"
                className="w-full bg-[#10B981] text-white font-bold py-4 rounded-full  border border-slate-200 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <Send size={18} /> {sending ? "Broadcasting..." : "Send Broadcast"}
              </motion.button>
            </form>
          </div>
        </motion.div>

        {/* --- Right Column: Broadcast History --- */}
        <motion.div variants={containerVars} initial={false} animate="show" className="lg:col-span-7 space-y-4">
          <h3 className="text-xl font-bold text-slate-700 mb-6 pl-2">Transmission History</h3>

          {broadcasts.length === 0 ? (
             <div className="bg-[#FFFFFF] p-8 rounded-lg border border-slate-200 text-center text-slate-500 font-medium">
               No broadcasts sent yet.
             </div>
          ) : (
            broadcasts.map((b) => (
              <motion.div key={b.id} variants={itemVars} className={`bg-[#FFFFFF] p-6 md:p-8 rounded-lg border ${b.urgency === 'urgent' ? 'border-red-400 border border-slate-200' : b.urgency === 'important' ? 'border-amber-400 ' : 'border-slate-200 border border-slate-200'}`}>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex gap-2 flex-wrap items-center">
                    {b.is_pinned && <div className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs font-bold normal-case tracking-normal"><Pin size={12}/> Pinned</div>}
                    {b.urgency === 'urgent' && <div className="flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold normal-case tracking-normal "><AlertCircle size={12}/> Urgent</div>}
                    <div className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-bold normal-case tracking-normal">
                      <Users size={12} /> Audience: {b.target_audience}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-xs font-bold text-slate-500 tracking-normal">
                    <span className="flex items-center gap-1"><Clock size={12} /> {new Date(b.created_at).toLocaleDateString()}</span>
                    {b.expires_at && <span className="text-xs text-rose-400 flex items-center gap-1"><CalendarClock size={10} /> Exp: {new Date(b.expires_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <h4 className="text-lg font-bold text-slate-800">{b.title}</h4>
                <p className="text-slate-500 mt-2 whitespace-pre-wrap text-sm leading-relaxed">{b.message}</p>

                {b.has_rsvp && b.rsvp_options && (
                  <div className="mt-4 p-3 bg-white/50 rounded-lg border border-slate-200">
                    <div className="text-xs font-bold text-slate-500 normal-case tracking-normal mb-2 flex items-center gap-1"><ListChecks size={14}/> Poll Included</div>
                    <div className="flex gap-2 flex-wrap">
                      {b.rsvp_options.map((opt: string, i: number) => (
                         <span key={i} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold">{opt}</span>
                      ))}
                    </div>
                  </div>
                )}

                {b.attachments && Array.isArray(b.attachments) && b.attachments.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {b.attachments.map((att: any, idx: number) => {
                      if (att.type === 'image') return (
                        <a key={idx} href={att.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg  hover:bg-emerald-100 transition-colors border border-emerald-200"><ImageIcon size={14}/> Image</a>
                      );
                      if (att.type === 'pdf') return (
                        <a key={idx} href={att.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 text-xs font-bold rounded-lg  hover:bg-rose-100 transition-colors border border-rose-200"><FileText size={14}/> Document (PDF)</a>
                      );
                      if (att.type === 'link') return (
                        <a key={idx} href={att.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-bold rounded-lg  hover:bg-blue-100 transition-colors border border-blue-200"><ExternalLink size={14}/> External Link</a>
                      );
                      return null;
                    })}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-slate-200/50 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs normal-case tracking-normal text-[#10B981] font-bold">
                    <CheckCircle2 size={14} /> Sent by {b.created_by}
                  </div>
                  <button onClick={() => handleDeleteBroadcast(b.id)} disabled={sending} className="text-slate-500 hover:text-rose-500 transition-colors p-1.5 rounded-full hover:bg-rose-50 disabled:opacity-50" title="Delete Broadcast">
                    <Trash2 size={16} />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </motion.div>

      </div>
    </div>
  );
}