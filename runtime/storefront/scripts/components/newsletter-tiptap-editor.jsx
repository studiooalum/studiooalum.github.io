import { Component, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { EditorContent, useEditor } from "@tiptap/react";
import { Node as TiptapNode } from "@tiptap/core";
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
  const allowedAttributes = new Set([
    "href",
    "src",
    "alt",
    "title",
    "width",
    "height",
    "data-image-align",
    "data-image-size",
    "data-image-position",
    "data-image-layout",
    "data-image-gallery",
    "data-image-count",
  ]);
  documentNode.body.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      if (!allowedAttributes.has(attribute.name.toLowerCase())) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return documentNode.body.innerHTML;
}

const NewsletterGallery = TiptapNode.create({
  name: "newsletterGallery",
  group: "block",
  content: "image{2,12}",
  isolating: true,
  defining: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'figure[data-image-gallery="true"]' }];
  },

  renderHTML({ node }) {
    return [
      "figure",
      {
        "data-image-gallery": "true",
        "data-image-count": String(node.childCount),
      },
      0,
    ];
  },
});

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
        renderHTML: (attributes) => attributes.imageAlign
          ? { "data-image-align": attributes.imageAlign }
          : {},
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
        getAttrs: (element) => (
          element.getAttribute("data-image-gallery") !== "true" && element.querySelector("img")
            ? {}
            : false
        ),
      },
      {
        tag: "img[src]:not([src^=\"data:\"])",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const {
      legacyFigure,
      imageAlign,
      imageSize,
      imagePosition,
      imageLayout,
      caption,
    } = node.attrs;
    const imageAttributes = { ...HTMLAttributes };
    imageAttributes["data-progressive-image"] = "false";

    if (!legacyFigure) return ["img", imageAttributes];

    delete imageAttributes["data-image-align"];
    const figureAttributes = {};
    if (imageAlign) figureAttributes["data-image-align"] = imageAlign;
    if (imageSize) figureAttributes["data-image-size"] = imageSize;
    if (imagePosition) figureAttributes["data-image-position"] = imagePosition;
    if (imageLayout) figureAttributes["data-image-layout"] = imageLayout;
    const children = [["img", imageAttributes]];
    if (caption) children.push(["figcaption", {}, caption]);
    return ["figure", figureAttributes, ...children];
  },
}).configure({
  allowBase64: false,
  HTMLAttributes: {
    "data-progressive-image": "false",
  },
  resize: {
    enabled: true,
    directions: ["bottom-left", "bottom-right"],
    minWidth: 80,
    minHeight: 50,
    // Tiptap must resize both dimensions together so uploaded images never stretch.
    alwaysPreserveAspectRatio: true,
  },
});

const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    code: false,
    codeBlock: false,
    heading: { levels: [1, 2, 3, 4, 5, 6] },
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
  NewsletterGallery,
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

const PRIMARY_FONT_OPTIONS = [
  { value: "Wanted Sans", label: "Wanted Sans · 제목" },
  { value: "GothamBook", label: "Gotham Book · 영문" },
  { value: "GothamLight", label: "Gotham Light" },
  { value: "GothamMedium", label: "Gotham Medium" },
  { value: "GothamBold", label: "Gotham Bold" },
];

const SECONDARY_FONT_OPTIONS = [
  "system-ui",
  "Arial",
  "Helvetica",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Gill Sans",
  "Times New Roman",
  "Georgia",
  "Garamond",
  "Courier New",
];

const MAX_GALLERY_IMAGES = 12;

const STYLE_OPTIONS = [
  { key: "paragraph", label: "Normal text", marker: "¶" },
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    key: `heading-${level}`,
    label: `Heading ${level}`,
    marker: `H${level}`,
    level,
  })),
];

function ToolIcon({ name }) {
  const common = {
    className: "newsletter-admin-tool__icon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  if (name === "undo") return <svg {...common}><path d="M9 7 5 11l4 4"/><path d="M5 11h8a6 6 0 0 1 6 6"/></svg>;
  if (name === "redo") return <svg {...common}><path d="m15 7 4 4-4 4"/><path d="M19 11h-8a6 6 0 0 0-6 6"/></svg>;
  if (name === "chevron") return <svg {...common}><path d="m8 10 4 4 4-4"/></svg>;
  if (name === "link") return <svg {...common}><path d="m10.5 13.5 3-3"/><path d="M7.4 15.6 5.8 17.2a3.4 3.4 0 1 0 4.8 4.8l3.1-3.1a3.4 3.4 0 0 0 0-4.8" transform="translate(0 -4)"/><path d="m16.6 8.4 1.6-1.6A3.4 3.4 0 1 1 23 11.6l-3.1 3.1a3.4 3.4 0 0 1-4.8 0" transform="translate(-4 0)"/></svg>;
  if (name === "image") return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 4.5-4.5 3.2 3.2 2.2-2.2L20 19"/></svg>;
  if (name === "quote") return <svg {...common}><path d="M7 10H4V7h5v5c0 3-1.5 5-4 6"/><path d="M17 10h-3V7h5v5c0 3-1.5 5-4 6"/></svg>;
  if (name === "bullet-list") return <svg {...common}><circle cx="5" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="17" r="1" fill="currentColor" stroke="none"/><path d="M9 7h10M9 12h10M9 17h10"/></svg>;
  if (name === "ordered-list") return <svg {...common}><path d="M4 6h1v3M3.5 9H6M3.5 13h2L3.5 16H6M9 7h10M9 12h10M9 17h10"/></svg>;
  if (name === "align-left") return <svg {...common}><path d="M4 6h16M4 10h11M4 14h16M4 18h9"/></svg>;
  if (name === "align-center") return <svg {...common}><path d="M4 6h16M6.5 10h11M4 14h16M7.5 18h9"/></svg>;
  if (name === "align-right") return <svg {...common}><path d="M4 6h16M9 10h11M4 14h16M11 18h9"/></svg>;
  if (name === "divider") return <svg {...common}><path d="M4 12h16"/></svg>;
  if (name === "check") return <svg {...common}><path d="m6 12 4 4 8-9"/></svg>;
  return null;
}

function StyleDropdown({ editor, disabled }) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function isActive(option) {
    return option.level
      ? Boolean(editor?.isActive("heading", { level: option.level }))
      : Boolean(editor?.isActive("paragraph"));
  }

  function applyStyle(option) {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (option.level) chain.setHeading({ level: option.level }).run();
    else chain.setParagraph().run();
    setOpen(false);
  }

  return (
    <div className={`newsletter-admin-style-menu${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="newsletter-admin-style-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>Style</span>
        <ToolIcon name="chevron" />
      </button>
      {open ? (
        <div className="newsletter-admin-style-menu__popover" role="menu" aria-label="문단 스타일">
          {STYLE_OPTIONS.map((option) => {
            const active = isActive(option);
            return (
              <button
                key={option.key}
                type="button"
                className={`newsletter-admin-style-option newsletter-admin-style-option--${option.key}${active ? " is-active" : ""}`}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => applyStyle(option)}
              >
                <span className="newsletter-admin-style-option__marker" aria-hidden="true">{option.marker}</span>
                <span className="newsletter-admin-style-option__label">{option.label}</span>
                {active ? <ToolIcon name="check" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

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
  const [uploadStatus, setUploadStatus] = useState("");
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
  const textStyleAttributes = editor?.getAttributes("textStyle") || {};
  const currentFontFamily = String(textStyleAttributes.fontFamily || "");

  function setFontFamily(value) {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (value) chain.setFontFamily(value).run();
    else chain.unsetFontFamily().run();
  }

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
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || !editor || !callbacksRef.current.onUploadImage) return;
    if (files.length > MAX_GALLERY_IMAGES) {
      callbacksRef.current.onStatus?.(`갤러리는 한 번에 최대 ${MAX_GALLERY_IMAGES}장까지 추가할 수 있습니다.`, "error");
      return;
    }

    setIsUploading(true);
    callbacksRef.current.onUploadStateChange?.(true);
    setUploadStatus(`0 / ${files.length}장 업로드 중`);
    callbacksRef.current.onStatus?.(`${files.length}장의 본문 이미지를 업로드하는 중입니다.`, "info");
    try {
      const imageUrls = [];
      const failures = [];
      for (let index = 0; index < files.length; index += 1) {
        try {
          const imageUrl = String(await callbacksRef.current.onUploadImage(files[index]) || "").trim();
          if (!imageUrl) throw new Error("업로드한 이미지 주소를 확인할 수 없습니다.");
          imageUrls.push(imageUrl);
        } catch (error) {
          failures.push(error);
        }
        setUploadStatus(`${index + 1} / ${files.length}장 업로드 중`);
      }

      if (!imageUrls.length) {
        throw failures[0] || new Error("본문 이미지를 업로드하지 못했습니다.");
      }
      if (uploadContentKeyRef.current !== externalContentRef.current.contentKey) {
        throw new Error("글이 변경되어 업로드한 이미지를 본문에 삽입하지 않았습니다.");
      }
      const position = Math.min(uploadPositionRef.current ?? editor.state.selection.anchor, editor.state.doc.content.size);
      const chain = editor.chain().focus().setTextSelection(position);
      if (imageUrls.length === 1) {
        chain.setImage({ src: imageUrls[0], alt: "", imageAlign: "center" }).run();
      } else {
        chain.insertContent({
          type: "newsletterGallery",
          content: imageUrls.map((src) => ({
            type: "image",
            attrs: { src, alt: "", imageAlign: "center" },
          })),
        }).run();
      }

      if (failures.length) {
        callbacksRef.current.onStatus?.(`${imageUrls.length}장을 추가했고 ${failures.length}장은 업로드하지 못했습니다.`, "error");
      } else {
        callbacksRef.current.onStatus?.(
          imageUrls.length > 1 ? `${imageUrls.length}장을 갤러리로 추가했습니다.` : "본문 이미지를 추가했습니다.",
          "success",
        );
      }
    } catch (error) {
      callbacksRef.current.onStatus?.(error.message || "본문 이미지를 업로드하지 못했습니다.", "error");
    } finally {
      setIsUploading(false);
      setUploadStatus("");
      callbacksRef.current.onUploadStateChange?.(false);
    }
  }

  return (
    <>
      <div className="newsletter-admin-toolbar" role="toolbar" aria-label="본문 서식">
        <div className="newsletter-admin-tool-group" aria-label="편집 기록">
          <ToolbarButton label="실행 취소" disabled={isDisabled || !editor?.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()}>
            <ToolIcon name="undo" />
          </ToolbarButton>
          <ToolbarButton label="다시 실행" disabled={isDisabled || !editor?.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()}>
            <ToolIcon name="redo" />
          </ToolbarButton>
        </div>
        <div className="newsletter-admin-tool-group newsletter-admin-tool-group--styles" aria-label="문단과 서체">
          <StyleDropdown editor={editor} disabled={isDisabled} />
          <label className="newsletter-admin-format-control newsletter-admin-format-control--font">
            <span className="newsletter-admin-format-control__label">Font</span>
            <select
              aria-label="폰트"
              value={currentFontFamily}
              disabled={isDisabled}
              onChange={(event) => setFontFamily(event.target.value)}
            >
              <option value="">Pretendard · 사이트 기본</option>
              <optgroup label="OALUM 주요 폰트">
                {PRIMARY_FONT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </optgroup>
              <optgroup label="기타 폰트">
                {SECONDARY_FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}
              </optgroup>
            </select>
          </label>
        </div>
        <div className="newsletter-admin-tool-group" aria-label="글자 형식">
          <ToolbarButton label="굵게" active={editor?.isActive("bold")} disabled={isDisabled} onClick={() => editor.chain().focus().toggleBold().run()}><strong className="newsletter-admin-tool__letter">B</strong></ToolbarButton>
          <ToolbarButton label="기울임" active={editor?.isActive("italic")} disabled={isDisabled} onClick={() => editor.chain().focus().toggleItalic().run()}><em className="newsletter-admin-tool__letter">I</em></ToolbarButton>
          <ToolbarButton label="밑줄" active={editor?.isActive("underline")} disabled={isDisabled} onClick={() => editor.chain().focus().toggleUnderline().run()}><u className="newsletter-admin-tool__letter">U</u></ToolbarButton>
          <ToolbarButton label="취소선" active={editor?.isActive("strike")} disabled={isDisabled} onClick={() => editor.chain().focus().toggleStrike().run()}><s className="newsletter-admin-tool__letter">S</s></ToolbarButton>
        </div>
        <div className="newsletter-admin-tool-group" aria-label="링크와 미디어">
          <ToolbarButton label="링크 추가, 수정 또는 해제" active={editor?.isActive("link")} disabled={isDisabled} onClick={updateLink}>
            <ToolIcon name="link" />
          </ToolbarButton>
          <ToolbarButton label="이미지 또는 갤러리 추가" disabled={isDisabled} onClick={chooseImage}>
            {isUploading ? <span aria-hidden="true">…</span> : <ToolIcon name="image" />}
          </ToolbarButton>
          <ToolbarButton label="인용문" active={editor?.isActive("blockquote")} disabled={isDisabled} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <ToolIcon name="quote" />
          </ToolbarButton>
        </div>
        <div className="newsletter-admin-tool-group" aria-label="목록">
          <ToolbarButton label="글머리표 목록" active={editor?.isActive("bulletList")} disabled={isDisabled} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <ToolIcon name="bullet-list" />
          </ToolbarButton>
          <ToolbarButton label="번호 목록" active={editor?.isActive("orderedList")} disabled={isDisabled} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ToolIcon name="ordered-list" />
          </ToolbarButton>
        </div>
        <div className="newsletter-admin-tool-group" aria-label="정렬과 구분선">
          <ToolbarButton label="왼쪽 정렬" active={editor?.isActive({ textAlign: "left" })} disabled={isDisabled} onClick={() => editor.chain().focus().setTextAlign("left").run()}><ToolIcon name="align-left" /></ToolbarButton>
          <ToolbarButton label="가운데 정렬" active={editor?.isActive({ textAlign: "center" })} disabled={isDisabled} onClick={() => editor.chain().focus().setTextAlign("center").run()}><ToolIcon name="align-center" /></ToolbarButton>
          <ToolbarButton label="오른쪽 정렬" active={editor?.isActive({ textAlign: "right" })} disabled={isDisabled} onClick={() => editor.chain().focus().setTextAlign("right").run()}><ToolIcon name="align-right" /></ToolbarButton>
          <ToolbarButton label="구분선" disabled={isDisabled} onClick={() => editor.chain().focus().setHorizontalRule().run()}><ToolIcon name="divider" /></ToolbarButton>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          multiple
          hidden
          onChange={uploadImage}
        />
      </div>
      <EditorContent editor={editor} className="newsletter-admin-editor-content" />
      {isUploading ? <p className="newsletter-admin-upload-status" role="status">{uploadStatus || "이미지 업로드 중..."}</p> : null}
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
