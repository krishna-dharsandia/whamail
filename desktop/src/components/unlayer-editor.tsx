"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { EditorRef, EmailEditorProps } from "react-email-editor";

const EmailEditor = dynamic(() => import("react-email-editor"), { ssr: false });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UnlayerDesign = Record<string, any>;

export interface UnlayerEditorHandle {
  exportHtml: () => Promise<{ html: string; design: UnlayerDesign }>;
  loadDesign: (design: UnlayerDesign) => void;
}

const DEFAULT_MERGE_TAGS = [
  { name: "Name", value: "{{name}}", sample: "John Doe" },
  { name: "Email", value: "{{email}}", sample: "user@example.com" },
];

interface Props {
  initialDesign?: UnlayerDesign | null;
  mergeTags?: Array<{ name: string; value: string; sample: string }>;
}

export const UnlayerEditor = forwardRef<UnlayerEditorHandle, Props>(
  ({ initialDesign, mergeTags }, ref) => {
    const editorRef = useRef<EditorRef>(null);
    const [ready, setReady] = useState(false);

    useImperativeHandle(ref, () => ({
      exportHtml: () =>
        new Promise((resolve, reject) => {
          const unlayer = editorRef.current?.editor;
          if (!unlayer) return reject(new Error("Editor not ready"));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          unlayer.exportHtml((data: any) => resolve({ html: data.html, design: data.design }));
        }),
      loadDesign: (design: UnlayerDesign) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editorRef.current?.editor?.loadDesign(design as any);
      },
    }));

    const onReady: EmailEditorProps["onReady"] = (unlayer) => {
      setReady(true);
      if (initialDesign) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unlayer.loadDesign(initialDesign as any);
      }
    };

    const rawMergeTags =
      mergeTags && mergeTags.length > 0 ? mergeTags : DEFAULT_MERGE_TAGS;

    const activeMergeTags = Object.fromEntries(
      rawMergeTags.map((tag) => [
        tag.value,
        { name: tag.name, value: tag.value, sample: tag.sample },
      ])
    );

    return (
      <div className="relative rounded-lg overflow-hidden border" style={{ height: "calc(100vh - 200px)" }}>
        {!ready && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs">Loading editor...</span>
            </div>
          </div>
        )}
        <EmailEditor
          ref={editorRef}
          onReady={onReady}
          minHeight="calc(100vh)"
          style={{ height: "calc(100vh)", width: "100%", display: "block" }}
          options={{
            displayMode: "email",
            mergeTags: activeMergeTags,
            appearance: {
              theme: "modern_dark",
              panels: { tools: { dock: "left" } },
            },
          }}
        />
      </div>
    );
  }
);

UnlayerEditor.displayName = "UnlayerEditor";
