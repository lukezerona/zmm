"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, LogOut, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import styles from "./bracket.module.css";

export default function BracketPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      if (!supabase) {
        router.replace("/");
        return;
      }

      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (error || !profile) {
        router.replace("/accept-invite");
        return;
      }

      setName(profile.display_name);
      setLoading(false);
    }

    void loadUser();
  }, [router]);

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  if (loading) {
    return <main className={styles.loading}><LoaderCircle size={28} /><span>Opening your bracket…</span></main>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Image src="/zmm-logo.png" alt="ZMM" width={855} height={483} priority />
        <button type="button" onClick={signOut}><LogOut size={17} /> Sign out</button>
      </header>
      <section className={styles.content}>
        <span className={styles.kicker}>2026 FAMILY TOURNAMENT</span>
        <h1>Good to see you, <em>{name}</em>.</h1>
        <p>You’re signed in and ready to build your road to the championship.</p>
        <div className={styles.placeholder}>
          <div className={styles.icon}><Trophy size={30} /></div>
          <span>CREATE BRACKET</span>
          <h2>Your bracket court is almost ready.</h2>
          <p>In the next step, we’ll add all 64 teams, round-by-round picks, championship scoring, and the final tiebreaker.</p>
          <div className={styles.progress}><i /><i /><i /><i /></div>
          <div className={styles.next}>Next up: the full bracket experience <ArrowRight size={16} /></div>
        </div>
      </section>
    </main>
  );
}
