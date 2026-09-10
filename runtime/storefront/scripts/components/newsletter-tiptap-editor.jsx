import { Component, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import {
  BackgroundColor,
  Color,
  FontSize,
  LineHeight,
  TextStyle,
} from "@tiptap/extension-text-style";

function cleanEditorHtml(editor) {
  if (!editor || editor.isEmpty) return "";
  return editor.getHTML();
}

function cleanPastedHtml(value) {
  const documentNode = new DOMParser().parseFromString(String(value || ""), "text/html");
  documentNode.body.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      if (!["href", "src", "alt"].includes(attribute.name.toLowerCase())) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return documentNode.body.innerHTML;
}

const NewsletterImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      legacyFigure: {
        default: false,
        parseHTML: (element) => element.tagName === "FIGURE",
        renderHTML: () => ({}),
      },
      imageAlign: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-image-align") || "",
        renderHTML: () => ({}),
      },
      imageSize: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-image-size") || "",
        renderHTML: () => ({}),
      },
      imagePosition: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-image-position") || "",
        renderHTML: () => ({}),
      },
      imageLayout: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-image-layout") || "",
        renderHTML: () => ({}),
      },
      caption: {
        default: "",
        parseHTML: (element) => element.querySelector("figcaption")?.textContent || "",
        renderHTML: () => ({}),
      },
      src: {
        default: null,
        parseHTML: (element) => {
          const image = element.tagName === "FIGURE" ? element.querySelector("img") : element;
          return image?.getAttribute("src") || null;
        },
      },
      alt: {
        default: null,
        parseHTML: (element) => {
          const image = element.tagName === "FIGURE" ? element.querySelector("img") : element;
          return image?.getAttribute("alt") || null;
        },
      },
      title: {
        default: null,
        parseHTML: (element) => {
          const image = element.tagName === "FIGURE" ? element.querySelector("img") : element;
          return image?.getAttribute("title") || null;
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure",
        getAttrs: (element) => element.querySelector("img") ? {} : false,
      },
      {
        tag: "img[src]:not([src^=\"data:\"])",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const {
      legacyFigure,
      imageAlign,
      imageSize,
      imagePosition,
      imageLayout,
      caption,
      ...imageAttributes
    } = HTMLAttributes;

    if (!legacyFigure) return ["img", imageAttributes];

    const figureAttributes = {};
    if (imageAlign) figureAttributes["data-image-align"] = imageAlign;
    if (imageSize) figureAttributes["data-image-size"] = imageSize;
    if (imagePosition) figureAttributes["data-image-position"] = imagePosition;
    if (imageLayout) figureAttributes["data-image-layout"] = imageLayout;
    const children = [["img", imageAttributes]];
    if (caption) children.push(["figcaption", {}, caption]);
    return ["figure", figureAttributes, ...children];
  },
}).configure({ allowBase64: false });

const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    code: false,
    codeBlock: false,
    heading: { levels: [2, 3] },
    link: false,
  }),
  TextStyle,
  FontFamily,
  FontSize,
  LineHeight,
  Color,
  BackgroundColor,
  TextAlign.configure({
    types: ["heading", "paragraph", "blockquote", "listItem"],
    alignments: ["left", "center", "right", "justify"],
  }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    linkOnPaste: true,
    HTMLAttributes: {
      target: "_blank",
      rel: "noopener noreferrer",
    },
  }),
  NewsletterImage,
  Placeholder.configure({ placeholder: "본문을 작성하세요." }),
];

const EDITOR_PROPS = {
  attributes: {
    class: "newsletter-admin-editor",
    role: "textbox",
    "aria-label": "뉴스레터 본문",
    "aria-multiline": "true",
  },
  transformPastedHTML: cleanPastedHtml,
};

function ToolbarButton({ active = false, disabled = false, label, onClick, children }) {
  return (
    <button
      type="button"
      className={`newsletter-admin-tool${active ? " is-active" : ""}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

class NewsletterEditorErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    this.props.onError?.(error);
  }

  render() {
    return this.state.error ? null : this.props.children;
  }
}

export function NewsletterTiptapEditor({
  value = "",
  contentKey = "",
  onChange,
  onUploadImage,
  onUploadStateChange,
  onStatus,
  onReady,
  disabled = false,
}) {
  const fileInputRef = useRef(null);
  const uploadPositionRef = useRef(null);
  const uploadContentKeyRef = useRef("");
  const callbacksRef = useRef({ onChange, onUploadImage, onUploadStateChange, onStatus });
  const externalContentRef = useRef({ contentKey, value: String(value || "") });
  const initialContentRef = useRef(String(value || ""));
  const [isUploading, setIsUploading] = useState(false);
  callbacksRef.current = { onChange, onUploadImage, onUploadStateChange, onStatus };

  const editor = useEditor({
    content: initialContentRef.current,
    extensions: EDITOR_EXTENSIONS,
    editorProps: EDITOR_PROPS,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: currentEditor }) => {
      callbacksRef.current.onChange?.(cleanEditorHtml(currentEditor));
    },
  }, []);

  useEffect(() => {
    if (!editor) return undefined;
    onReady?.(editor);
    return () => onReady?.(null);
  }, [editor, onReady]);

  useEffect(() => {
    if (!editor) return;
    const nextContent = { contentKey, value: String(value || "") };
    const previousContent = externalContentRef.current;
    if (previousContent.contentKey === nextContent.contentKey && previousContent.value === nextContent.value) return;
    externalContentRef.current = nextContent;
    if (cleanEditorHtml(editor) !== nextContent.value) {
      editor.commands.setContent(nextContent.value, { emitUpdate: false });
    }
  }, [contentKey, editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled && !isUploading);
  }, [disabled, editor, isUploading]);

  const isDisabled = disabled || isUploading || !editor;

  function updateLink() {
    if (!editor) return;
    const previousUrl = String(editor.getAttributes("link").href || "");
    const rawUrl = window.prompt("링크 주소", previousUrl);
    if (rawUrl === null) return;
    if (!rawUrl.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    try {
      const url = new URL(rawUrl.trim(), window.location.origin);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid URL");
      editor.chain().focus().extendMarkRange("link").setLink({ href: url.toString() }).run();
    } catch {
      callbacksRef.current.onStatus?.("http 또는 https 주소를 입력해주세요.", "error");
    }
  }

  function chooseImage() {
    if (!editor || isDisabled) return;
    uploadPositionRef.current = editor.state.selection.anchor;
    uploadContentKeyRef.current = externalContentRef.current.contentKey;
    fileInputRef.current?.click();
  }

  async function uploadImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editor || !callbacksRef.current.onUploadImage) return;

    setIsUploading(true);
    callbacksRef.current.onUploadStateChange?.(true);
    callbacksRef.current.onStatus?.("본문 이미지를 업로드하는 중입니다.", "info");
    try {
      const imageUrl = String(await callbacksRef.current.onUploadImage(file) || "").trim();
      if (!imageUrl) throw new Error("업로드한 이미지 주소를 확인할 수 없습니다.");
      if (uploadContentKeyRef.current !== externalContentRef.current.contentKey) {
        throw new Error("글이 변경되어 업로드한 이미지를 본문에 삽입하지 않았습니다.");
      }
      const position = Math.min(uploadPositionRef.current ?? editor.state.selection.anchor, editor.state.doc.content.size);
      editor.chain().focus().insertContentAt(position, { type: "image", attrs: { src: imageUrl, alt: "" } }).run();
      callbacksRef.current.onStatus?.("본문 이미지를 추가했습니다.", "success");
    } catch (error) {
      callbacksRef.current.onStatus?.(error.message || "본문 이미지를 업로드하지 못했습니다.", "error");
    } finally {
      setIsUploading(false);
      callbacksRef.current.onUploadStateChange?.(false);
    }
  }

  return (
    <>
      <div className="newsletter-admin-toolbar" role="toolbar" aria-label="본문 서식">
        <div className="newsletter-admin-tool-group" aria-label="문단 형식">
          <ToolbarButton label="일반 문단" active={editor?.isActive("paragraph")} disabled={isDisabled} onClick={() => editor.chain().focus().setParagraph().run()}>P</ToolbarButton>
          <ToolbarButton label="제목 2" active={editor?.isActive("heading", { level: 2 })} disabled={isDisabled} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
          <ToolbarButton label="제목 3" active={editor?.isActive("heading", { level: 3 })} disabled={isDisabled} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>
        </div>
        <div className="newsletter-admin-tool-group" aria-label="글자 형식">
          <ToolbarButton label="굵게" active={editor?.isActive("bold")} disabled={isDisabled} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></ToolbarButton>
          <ToolbarButton label="기울임" active={editor?.isActive("italic")} disabled={isDisabled} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></ToolbarButton>
          <ToolbarButton label="밑줄" active={editor?.isActive("underline")} disabled={isDisabled} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarButton>
          <ToolbarButton label="취소선" active={editor?.isActive("strike")} disabled={isDisabled} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></ToolbarButton>
        </div>
        <div className="newsletter-admin-tool-group" aria-label="목록과 인용">
          <ToolbarButton label="글머리표 목록" active={editor?.isActive("bulletList")} disabled={isDisabled} onClick={() => editor.chain().focus().toggleBulletList().run()}>•</ToolbarButton>
          <ToolbarButton label="번호 목록" active={editor?.isActive("orderedList")} disabled={isDisabled} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</ToolbarButton>
          <ToolbarButton label="인용문" active={editor?.isActive("blockquote")} disabled={isDisabled} onClick={() => editor.chain().focus().toggleBlockquote().run()}>“</ToolbarButton>
        </div>
        <div className="newsletter-admin-tool-group" aria-label="정렬">
          <ToolbarButton label="왼쪽 정렬" active={editor?.isActive({ textAlign: "left" })} disabled={isDisabled} onClick={() => editor.chain().focus().setTextAlign("left").run()}>←</ToolbarButton>
          <ToolbarButton label="가운데 정렬" active={editor?.isActive({ textAlign: "center" })} disabled={isDisabled} onClick={() => editor.chain().focus().setTextAlign("center").run()}>↔</ToolbarButton>
          <ToolbarButton label="오른쪽 정렬" active={editor?.isActive({ textAlign: "right" })} disabled={isDisabled} onClick={() => editor.chain().focus().setTextAlign("right").run()}>→</ToolbarButton>
        </div>
        <div className="newsletter-admin-tool-group" aria-label="삽입">
          <ToolbarButton label="링크 추가 또는 수정" active={editor?.isActive("link")} disabled={isDisabled} onClick={updateLink}>↗</ToolbarButton>
          <ToolbarButton label="링크 해제" disabled={isDisabled || !editor?.isActive("link")} onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}>×↗</ToolbarButton>
          <ToolbarButton label="이미지 추가" disabled={isDisabled} onClick={chooseImage}>{isUploading ? "…" : "+"}</ToolbarButton>
          <ToolbarButton label="구분선" disabled={isDisabled} onClick={() => editor.chain().focus().setHorizontalRule().run()}>—</ToolbarButton>
        </div>
        <div className="newsletter-admin-tool-group" aria-label="편집 기록">
          <ToolbarButton label="실행 취소" disabled={isDisabled || !editor?.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()}>↶</ToolbarButton>
          <ToolbarButton label="다시 실행" disabled={isDisabled || !editor?.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()}>↷</ToolbarButton>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          hidden
          onChange={uploadImage}
        />
      </div>
      <EditorContent editor={editor} className="newsletter-admin-editor-content" />
      {isUploading ? <p className="newsletter-admin-upload-status" role="status">이미지 업로드 중...</p> : null}
    </>
  );
}

export function mountNewsletterTiptapEditor(element, initialOptions = {}) {
  if (!element) throw new Error("Tiptap 편집기를 표시할 요소가 없습니다.");
  const root = createRoot(element);
  let editor = null;
  let options = { ...initialOptions };

  const handleReady = (nextEditor) => {
    editor = nextEditor;
    if (nextEditor) options.onReady?.();
  };

  const render = () => {
    root.render(
      <NewsletterEditorErrorBoundary onError={options.onFatalError}>
        <NewsletterTiptapEditor {...options} onReady={handleReady} />
      </NewsletterEditorErrorBoundary>,
    );
  };

  render();

  return {
    destroy() {
      root.unmount();
      editor = null;
    },
    focus() {
      editor?.commands.focus();
    },
    getHTML() {
      return editor ? cleanEditorHtml(editor) : String(options.value || "");
    },
    getText() {
      return editor?.getText().trim() || "";
    },
    isEmpty() {
      return editor ? editor.isEmpty : !String(options.value || "").replace(/<[^>]*>/g, "").trim();
    },
    setContent(value, contentKey) {
      options = { ...options, value: String(value || ""), contentKey: String(contentKey || "") };
      render();
    },
    setDisabled(disabled) {
      options = { ...options, disabled: Boolean(disabled) };
      render();
    },
  };
}
