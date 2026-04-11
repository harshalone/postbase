"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Trash2, X } from "lucide-react";

type Member = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};

export function ManageMembersDialog({
  orgId,
  orgName,
}: {
  orgId: string;
  orgName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const fetchMembers = async () => {
    setFetching(true);
    try {
      const res = await fetch(`/api/dashboard/organisations/${orgId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members);
      }
    } catch (err) {
      console.error("Failed to fetch members", err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchMembers();
    }
  }, [open, orgId]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    const res = await fetch(`/api/dashboard/organisations/${orgId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role: "member" }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to add member");
      return;
    }
    setEmail("");
    fetchMembers();
  }

  async function removeMember(userId: string) {
    if (!confirm("Are you sure you want to remove this member?")) return;
    setLoading(true);
    const res = await fetch(`/api/dashboard/organisations/${orgId}/members/${userId}`, {
      method: "DELETE",
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to remove member");
      return;
    }
    fetchMembers();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="cursor-pointer px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 rounded-lg transition-colors flex items-center gap-1.5"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Members
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Manage Members</h2>
                <p className="text-xs text-zinc-500 mt-0.5">{orgName}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Add Member Form */}
              <form onSubmit={addMember} className="space-y-2">
                <label className="block text-xs font-medium text-zinc-400">
                  Invite Member by Email
                </label>
                <div className="flex gap-2">
                  <input
                    autoFocus
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="cursor-pointer px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Adding..." : "Invite"}
                  </button>
                </div>
                {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
                <p className="text-[10px] text-zinc-500">
                  * Users must already be registered as administrators to be added.
                </p>
              </form>

              {/* Members List */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Team Members
                </h3>
                {fetching ? (
                  <div className="py-8 text-center text-zinc-600 text-sm italic">
                    Loading members...
                  </div>
                ) : members.length === 0 ? (
                  <div className="py-8 text-center text-zinc-600 text-sm italic">
                    No members found.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-800"
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-200">
                            {member.email}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              member.role === "owner" 
                                ? "bg-amber-500/10 text-amber-500" 
                                : "bg-zinc-700 text-zinc-400"
                            }`}>
                              {member.role}
                            </span>
                            <span className="text-[10px] text-zinc-600">
                              Joined {new Date(member.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => removeMember(member.id)}
                          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                          title="Remove member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-zinc-950/50 border-t border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="cursor-pointer px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
