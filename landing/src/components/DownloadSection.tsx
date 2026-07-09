"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

const REPO = "krishna-dharsandia/whamail";

interface Release {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

export default function DownloadSection() {
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then((res) => {
        if (res.status === 404) throw new Error("no-release");
        if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setRelease(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.message === "no-release") {
          setError("No release published yet. Check back soon.");
        } else {
          setError("Could not fetch latest version.");
        }
        setLoading(false);
      });
  }, []);

  const findAsset = (pattern: string) =>
    release?.assets.find((a) => a.name.includes(pattern))?.browser_download_url;

  const ver = release ? release.tag_name.replace(/^v/, "") : "";

  if (loading) {
    return <p className="text-zinc-500 text-sm">Checking for latest version…</p>;
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  const winUrl = findAsset("Setup") && findAsset("x64.exe");
  const macArmUrl = findAsset("arm64.dmg");
  const macX64Url = findAsset("x64.dmg");

  return (
    <>
      <Badge variant="secondary" className="mb-6 text-sm px-3 py-1">
        v{ver}
      </Badge>

      <div className="flex flex-col gap-3 w-full">
        {winUrl && (
          <a href={winUrl}>
            <Button className="w-full h-11 text-base gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
              </svg>
              Download for Windows (64-bit)
            </Button>
          </a>
        )}
        {macArmUrl && (
          <a href={macArmUrl}>
            <Button variant="outline" className="w-full h-11 text-base gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z" />
              </svg>
              Download for macOS (Apple Silicon)
            </Button>
          </a>
        )}
        {macX64Url && (
          <a href={macX64Url}>
            <Button variant="outline" className="w-full h-11 text-base gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z" />
              </svg>
              Download for macOS (Intel)
            </Button>
          </a>
        )}
        {!winUrl && !macArmUrl && !macX64Url && (
          <p className="text-zinc-500 text-sm text-center">
            No downloads available yet for this release.
          </p>
        )}
      </div>
    </>
  );
}
