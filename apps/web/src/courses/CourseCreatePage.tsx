import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CaretDown,
  CaretUp,
  Check,
  DotsSixVertical,
  DotsThreeVertical,
  Eye,
  FileText,
  FloppyDisk,
  Image as ImageIcon,
  Lightning,
  ListBullets,
  ListNumbers,
  LockKey,
  Paperclip,
  PencilSimple,
  PlayCircle,
  Plus,
  Quotes,
  Smiley,
  Sparkle,
  Tag,
  TextB,
  TextItalic,
  Trash,
  UploadSimple,
  Video,
  X,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { ThemedSelect } from "../ThemedSelect";
import type { NavigateTo } from "../routing/navigation";

import { ConfirmDeleteModal } from "../ConfirmDeleteModal";

export type CourseWizardStepId =
  | "basics"
  | "curriculum"
  | "access-rules"
  | "pricing"
  | "extras"
  | "publish";

type WizardStepIcon = ComponentType<{
  size?: number;
  weight?: "bold" | "duotone" | "fill" | "regular";
}>;

interface WizardStepDefinition {
  id: CourseWizardStepId;
  label: string;
  Icon: WizardStepIcon;
}

const WIZARD_STEPS: readonly WizardStepDefinition[] = [
  { id: "basics", label: "Basics", Icon: BookOpen },
  { id: "curriculum", label: "Curriculum", Icon: ListBullets },
  { id: "access-rules", label: "Access Rules", Icon: LockKey },
  { id: "pricing", label: "Pricing", Icon: Tag },
  { id: "extras", label: "Extras", Icon: Sparkle },
  { id: "publish", label: "Publish", Icon: Lightning },
];

export interface CourseCreatePageProps {
  onNavigatePage?: NavigateTo;
}

export function CourseCreatePage({ onNavigatePage }: CourseCreatePageProps) {
  const [activeStep, setActiveStep] = useState<CourseWizardStepId>("basics");

  // Basics Form state
  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [category, setCategory] = useState("");
  const [difficultyLevel, setDifficultyLevel] = useState("");

  const categoryOptions = [
    ["", "Select a category"],
    ["Development", "Development"],
    ["Design", "Design"],
    ["Database", "Database"],
    ["Cloud", "Cloud"],
  ] as const;

  const difficultyOptions = [
    ["", "Select difficulty level"],
    ["Beginner", "Beginner"],
    ["Intermediate", "Intermediate"],
    ["Advanced", "Advanced"],
  ] as const;

  const handleBack = () => {
    if (onNavigatePage) {
      onNavigatePage("courses");
    } else if (typeof window !== "undefined") {
      window.history.back();
    }
  };

  // Curriculum Data interfaces
  interface LessonResourceItem {
    id: string;
    name: string;
    type: "PDF" | "TXT" | "DOC";
    size: string;
  }

  interface CurriculumLessonItem {
    id: string;
    title: string;
    description: string;
    contentType: "video" | "document";
    isExpanded: boolean;
    resources: LessonResourceItem[];
  }

  interface CurriculumSectionItem {
    id: string;
    title: string;
    isExpanded: boolean;
    isEditingTitle?: boolean;
    lessons: CurriculumLessonItem[];
  }

  // Curriculum Step state
  const [sections, setSections] = useState<CurriculumSectionItem[]>([
    {
      id: "section-1",
      title: "Introduction to the Course",
      isExpanded: true,
      lessons: [],
    },
  ]);

  // Drag and Drop state for Sections & Lessons
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(null);
  const [draggedLessonState, setDraggedLessonState] = useState<{
    sectionId: string;
    lessonIndex: number;
  } | null>(null);

  // Reusable Delete Confirmation Modal state
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Section actions
  const handleAddSection = () => {
    const newId = `section-${Date.now()}`;
    setSections((prev) => [
      ...prev,
      {
        id: newId,
        title: `Section ${prev.length + 1}`,
        isExpanded: true,
        isEditingTitle: true,
        lessons: [],
      },
    ]);
  };

  const handleToggleSectionExpand = (sectionId: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, isExpanded: !s.isExpanded } : s))
    );
  };

  const handleStartEditSectionTitle = (sectionId: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, isEditingTitle: true } : s))
    );
  };

  const handleSaveSectionTitle = (sectionId: string, newTitle: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, title: newTitle.trim() || s.title, isEditingTitle: false }
          : s
      )
    );
  };

  const handleDeleteSection = (sectionId: string) => {
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return;
    setDeleteModalState({
      isOpen: true,
      title: `Delete "${sec.title}"?`,
      message: `Are you sure you want to delete "${sec.title}" and its ${sec.lessons.length} lessons? This action cannot be undone.`,
      onConfirm: () => {
        setSections((prev) => prev.filter((s) => s.id !== sectionId));
      },
    });
  };

  // Section Drag and Drop handlers
  const handleSectionDragStart = (index: number) => {
    setDraggedSectionIndex(index);
  };

  const handleSectionDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedSectionIndex === null || draggedSectionIndex === index) return;
    setSections((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(draggedSectionIndex, 1);
      if (moved) {
        copy.splice(index, 0, moved);
      }
      return copy;
    });
    setDraggedSectionIndex(index);
  };

  const handleSectionDragEnd = () => {
    setDraggedSectionIndex(null);
  };

  // Lesson actions
  const handleAddLesson = (sectionId: string) => {
    const newLessonId = `lesson-${Date.now()}`;
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: [
            ...sec.lessons.map((l) => ({ ...l, isExpanded: false })),
            {
              id: newLessonId,
              title: `New Lesson ${sec.lessons.length + 1}`,
              description: "",
              contentType: "video" as const,
              isExpanded: true,
              resources: [],
            },
          ],
        };
      })
    );
  };

  const handleToggleLessonExpand = (sectionId: string, lessonId: string) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) =>
            l.id === lessonId ? { ...l, isExpanded: !l.isExpanded } : l
          ),
        };
      })
    );
  };

  const handleDeleteLesson = (sectionId: string, lessonId: string) => {
    const sec = sections.find((s) => s.id === sectionId);
    const les = sec?.lessons.find((l) => l.id === lessonId);
    if (!les) return;

    setDeleteModalState({
      isOpen: true,
      title: `Delete "${les.title}"?`,
      message: `Are you sure you want to delete lesson "${les.title}"? This action cannot be undone.`,
      onConfirm: () => {
        setSections((prev) =>
          prev.map((s) => {
            if (s.id !== sectionId) return s;
            return {
              ...s,
              lessons: s.lessons.filter((l) => l.id !== lessonId),
            };
          })
        );
      },
    });
  };

  const handleUpdateLesson = (
    sectionId: string,
    lessonId: string,
    updates: Partial<CurriculumLessonItem>
  ) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) =>
            l.id === lessonId ? { ...l, ...updates } : l
          ),
        };
      })
    );
  };

  const handleSaveLesson = (sectionId: string, lessonId: string) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) =>
            l.id === lessonId ? { ...l, isExpanded: false } : l
          ),
        };
      })
    );
  };

  const handleAddLessonResource = (sectionId: string, lessonId: string) => {
    const newResId = `res-${Date.now()}`;
    const sampleFiles = [
      { name: "Lesson_Notes.pdf", type: "PDF" as const, size: "1.8 MB" },
      { name: "Source_Code.txt", type: "TXT" as const, size: "850 B" },
      { name: "Reference_Doc.pdf", type: "PDF" as const, size: "3.1 MB" },
    ];
    const chosen = sampleFiles[Math.floor(Math.random() * sampleFiles.length)]!;
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) => {
            if (l.id !== lessonId) return l;
            return {
              ...l,
              resources: [...l.resources, { id: newResId, ...chosen }],
            };
          }),
        };
      })
    );
  };

  const handleRemoveLessonResource = (
    sectionId: string,
    lessonId: string,
    resourceId: string
  ) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) => {
            if (l.id !== lessonId) return l;
            return {
              ...l,
              resources: l.resources.filter((r) => r.id !== resourceId),
            };
          }),
        };
      })
    );
  };

  // Lesson Drag and Drop handlers
  const handleLessonDragStart = (sectionId: string, lessonIndex: number) => {
    setDraggedLessonState({ sectionId, lessonIndex });
  };

  const handleLessonDragOver = (
    e: React.DragEvent,
    targetSectionId: string,
    targetLessonIndex: number
  ) => {
    e.preventDefault();
    if (!draggedLessonState) return;
    if (
      draggedLessonState.sectionId === targetSectionId &&
      draggedLessonState.lessonIndex === targetLessonIndex
    ) {
      return;
    }

    setSections((prev) => {
      const copy = structuredClone(prev);
      const sourceSec = copy.find((s) => s.id === draggedLessonState.sectionId);
      const targetSec = copy.find((s) => s.id === targetSectionId);
      if (!sourceSec || !targetSec) return prev;

      const [movedLesson] = sourceSec.lessons.splice(
        draggedLessonState.lessonIndex,
        1
      );
      if (movedLesson) {
        targetSec.lessons.splice(targetLessonIndex, 0, movedLesson);
      }
      return copy;
    });

    setDraggedLessonState({
      sectionId: targetSectionId,
      lessonIndex: targetLessonIndex,
    });
  };

  const handleLessonDragEnd = () => {
    setDraggedLessonState(null);
  };

  // Computed total stats
  const totalSections = sections.length;
  const totalLessons = sections.reduce((acc, sec) => acc + sec.lessons.length, 0);

  return (
    <div className="course-wizard-layout">
      {/* Wizard Header */}
      <header className="course-wizard-header">
        <div className="course-wizard-header__main">
          <button
            type="button"
            className="course-wizard-back-btn"
            onClick={handleBack}
            aria-label="Go back to courses"
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div className="course-wizard-header__title-group">
            <div className="course-wizard-header__title-row">
              <h1>Create New Course</h1>
              <span className="course-wizard-status-badge">Draft</span>
            </div>
            <p>
              {activeStep === "curriculum"
                ? "Build your course structure by adding sections and lessons."
                : "Add the essential details of your course. You can always edit these later."}
            </p>
          </div>
        </div>

        {/* Wizard Steps Navigation */}
        <nav className="course-wizard-steps" aria-label="Course creation steps">
          {WIZARD_STEPS.map((step) => {
            const Icon = step.Icon;
            const isActive = activeStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                className={`course-wizard-step-tab ${isActive ? "is-active" : ""}`}
                onClick={() => setActiveStep(step.id)}
              >
                <Icon size={18} weight={isActive ? "bold" : "regular"} />
                <span>{step.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Scrollable Step Content Region */}
      <div className="course-wizard-content">
        {activeStep === "basics" ? (
          <div className="course-wizard-body">
            {/* Left Column: Form Sections */}
            <div className="course-wizard-form-col">
              {/* Basic Information Section */}
              <section className="course-wizard-card">
                <div className="course-wizard-card__header">
                  <h2>Basic Information</h2>
                  <p>Add the essential details of your course.</p>
                </div>

                <div className="course-wizard-form-group">
                  <label htmlFor="course-title">
                    Course Title <span className="req-star">*</span>
                  </label>
                  <div className="course-wizard-input-wrap">
                    <input
                      id="course-title"
                      type="text"
                      maxLength={120}
                      placeholder="e.g. Complete Backend with Node.js"
                      value={courseTitle}
                      onChange={(e) => setCourseTitle(e.target.value)}
                    />
                    <span className="course-wizard-char-count">
                      {courseTitle.length} / 120
                    </span>
                  </div>
                </div>

                <div className="course-wizard-form-group">
                  <label htmlFor="course-description">
                    Course Description <span className="req-star">*</span>
                  </label>
                  <div className="course-wizard-editor">
                    <div className="course-wizard-editor__toolbar">
                      <div className="course-wizard-editor__select">
                        <select aria-label="Text format">
                          <option value="normal">Normal</option>
                          <option value="h1">Heading 1</option>
                          <option value="h2">Heading 2</option>
                        </select>
                      </div>
                      <div className="course-wizard-editor__divider" />
                      <button
                        type="button"
                        title="Bold"
                        className="editor-btn"
                        aria-label="Bold"
                      >
                        <TextB size={16} weight="bold" />
                      </button>
                      <button
                        type="button"
                        title="Italic"
                        className="editor-btn"
                        aria-label="Italic"
                      >
                        <TextItalic size={16} weight="bold" />
                      </button>
                      <div className="course-wizard-editor__divider" />
                      <button
                        type="button"
                        title="Bullet List"
                        className="editor-btn"
                        aria-label="Bullet List"
                      >
                        <ListBullets size={16} />
                      </button>
                      <button
                        type="button"
                        title="Numbered List"
                        className="editor-btn"
                        aria-label="Numbered List"
                      >
                        <ListNumbers size={16} />
                      </button>
                      <button
                        type="button"
                        title="Checklist"
                        className="editor-btn"
                        aria-label="Checklist"
                      >
                        <Check size={16} weight="bold" />
                      </button>
                      <button
                        type="button"
                        title="Quote"
                        className="editor-btn"
                        aria-label="Quote"
                      >
                        <Quotes size={16} />
                      </button>
                      <div className="course-wizard-editor__divider" />
                      <button
                        type="button"
                        title="Add Link"
                        className="editor-btn"
                        aria-label="Add Link"
                      >
                        <Paperclip size={16} />
                      </button>
                      <button
                        type="button"
                        title="Attachment"
                        className="editor-btn"
                        aria-label="Attachment"
                      >
                        <ImageIcon size={16} />
                      </button>
                      <button
                        type="button"
                        title="Emoji"
                        className="editor-btn"
                        aria-label="Emoji"
                      >
                        <Smiley size={16} />
                      </button>
                    </div>
                    <textarea
                      id="course-description"
                      rows={5}
                      maxLength={1500}
                      placeholder="Describe what your course is about, what students will learn, and who this course is for..."
                      value={courseDescription}
                      onChange={(e) => setCourseDescription(e.target.value)}
                    />
                    <div className="course-wizard-editor__footer">
                      <span className="course-wizard-char-count">
                        {courseDescription.length} / 1500
                      </span>
                    </div>
                  </div>
                </div>

                <div className="course-wizard-form-row">
                  <div className="course-wizard-form-group">
                    <label id="category-label">
                      Category <span className="req-star">*</span>
                    </label>
                    <ThemedSelect
                      value={category}
                      onValueChange={setCategory}
                      options={categoryOptions}
                      ariaLabel="Select category"
                      triggerClassName="course-wizard-select-trigger"
                    />
                  </div>

                  <div className="course-wizard-form-group">
                    <label id="difficulty-label">
                      Difficulty Level <span className="req-star">*</span>
                    </label>
                    <ThemedSelect
                      value={difficultyLevel}
                      onValueChange={setDifficultyLevel}
                      options={difficultyOptions}
                      ariaLabel="Select difficulty level"
                      triggerClassName="course-wizard-select-trigger"
                    />
                  </div>
                </div>
              </section>

              {/* Course Media Section */}
              <section className="course-wizard-card">
                <div className="course-wizard-card__header">
                  <h2>Course Media</h2>
                  <p>Add media that best represents your course.</p>
                </div>

                <div className="course-wizard-media-grid">
                  {/* Thumbnail Upload */}
                  <div className="course-wizard-media-box">
                    <h3>
                      Thumbnail <span className="req-star">*</span>
                    </h3>
                    <p className="media-sub">
                      Select a thumbnail from your media library.
                    </p>
                    <div className="course-wizard-media-dropzone">
                      <div className="dropzone-icon">
                        <ImageIcon size={32} weight="light" />
                      </div>
                      <button
                        type="button"
                        className="course-wizard-btn-secondary"
                      >
                        Select from Media
                      </button>
                      <p className="dropzone-hint">
                        Recommended: 1280x720px (16:9)
                      </p>
                    </div>
                  </div>

                  {/* Video Trailer Upload */}
                  <div className="course-wizard-media-box">
                    <h3>Video Trailer (Optional)</h3>
                    <p className="media-sub">
                      Add a trailer video to showcase your course.
                    </p>
                    <div className="course-wizard-media-dropzone">
                      <div className="dropzone-icon">
                        <PlayCircle size={32} weight="light" />
                      </div>
                      <button
                        type="button"
                        className="course-wizard-btn-secondary"
                      >
                        Select from Media
                      </button>
                      <p className="dropzone-hint">Recommended: 16:9 video</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Live Course Preview */}
            <div className="course-wizard-preview-col">
              <section className="course-wizard-preview-card">
                <h2>Course Preview</h2>
                <p className="preview-sub">
                  This is how your course will appear to students.
                </p>

                <div className="course-preview-media">
                  <div className="course-preview-media__placeholder">
                    <div className="course-preview-media__placeholder-icon">
                      <ImageIcon size={32} weight="light" />
                    </div>
                    <span>Course thumbnail will appear here</span>
                  </div>
                </div>

                <div className="course-preview-info">
                  <h3 className="course-preview-title">
                    {courseTitle.trim() ? courseTitle : "Course Title"}
                  </h3>

                  {difficultyLevel && (
                    <div className="course-preview-badge">
                      <span>{difficultyLevel}</span>
                    </div>
                  )}

                  <div className="course-preview-meta">
                    <span>
                      <BookOpen size={15} /> {totalSections} Sections
                    </span>
                    <span>
                      <BookOpen size={15} /> {totalLessons} Lessons
                    </span>
                    <span>0h 0m</span>
                  </div>

                  <div className="course-preview-about">
                    <h4>About this course</h4>
                    <p>
                      {courseDescription.trim()
                        ? courseDescription
                        : "This is a short description of your course. It will appear here on the course card."}
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : activeStep === "curriculum" ? (
          <div className="curriculum-container">
            {/* Header row */}
            <div className="curriculum-header-row">
              <div className="curriculum-title-area">
                <h2>Course Curriculum</h2>
                <p>
                  Organize your course into sections and lessons. You can reorder
                  them anytime.
                </p>
              </div>
              <div className="curriculum-header-actions">
                <button
                  type="button"
                  className="curriculum-add-section-btn"
                  onClick={handleAddSection}
                >
                  <Plus size={16} weight="bold" /> Add Section
                </button>
              </div>
            </div>

            {/* Sections list */}
            {sections.map((sec, secIndex) => (
              <div
                key={sec.id}
                className="curriculum-section-card"
                draggable
                onDragStart={() => handleSectionDragStart(secIndex)}
                onDragOver={(e) => handleSectionDragOver(e, secIndex)}
                onDragEnd={handleSectionDragEnd}
              >
                {/* Section Header */}
                <div
                  className="curriculum-section-header"
                  onClick={() => handleToggleSectionExpand(sec.id)}
                  style={{ cursor: "pointer" }}
                  title="Click to toggle section"
                >
                  <div className="curriculum-section-header__left">
                    <span
                      className="curriculum-drag-handle"
                      title="Drag to reorder section"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DotsSixVertical size={18} />
                    </span>
                    <div className="curriculum-section-title-wrap">
                      <span className="curriculum-section-tag">
                        Section {secIndex + 1}
                      </span>
                      {sec.isEditingTitle ? (
                        <input
                          type="text"
                          className="curriculum-section-edit-input"
                          defaultValue={sec.title}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) =>
                            handleSaveSectionTitle(sec.id, e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleSaveSectionTitle(
                                sec.id,
                                (e.target as HTMLInputElement).value
                              );
                            }
                          }}
                        />
                      ) : (
                        <span
                          className="curriculum-section-title"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEditSectionTitle(sec.id);
                          }}
                          title="Click to edit section title"
                        >
                          {sec.title}
                        </span>
                      )}
                      <span className="curriculum-section-count">
                        {sec.lessons.length} Lessons
                      </span>
                    </div>
                  </div>
                  <div className="curriculum-section-header__right">
                    <button
                      type="button"
                      className="curriculum-icon-btn"
                      aria-label="Edit section title"
                      title="Edit section title"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEditSectionTitle(sec.id);
                      }}
                    >
                      <PencilSimple size={16} />
                    </button>
                    <button
                      type="button"
                      className="curriculum-icon-btn curriculum-icon-btn--danger"
                      aria-label="Delete section"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSection(sec.id);
                      }}
                    >
                      <Trash size={16} />
                    </button>
                    <button
                      type="button"
                      className={`curriculum-icon-btn curriculum-caret-btn ${
                        sec.isExpanded ? "is-expanded" : ""
                      }`}
                      aria-label={sec.isExpanded ? "Collapse section" : "Expand section"}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSectionExpand(sec.id);
                      }}
                    >
                      <CaretDown size={16} weight="bold" />
                    </button>
                  </div>
                </div>

                {/* Section Body with CSS expand transition */}
                <div
                  className={`curriculum-section-body-wrapper ${
                    sec.isExpanded ? "is-open" : ""
                  }`}
                >
                  <div className="curriculum-section-body">
                    <div className="curriculum-lessons-list">
                      {sec.lessons.map((les, lesIndex) => (
                        <div
                          key={les.id}
                          className="curriculum-lesson-row"
                          draggable
                          onDragStart={() =>
                            handleLessonDragStart(sec.id, lesIndex)
                          }
                          onDragOver={(e) =>
                            handleLessonDragOver(e, sec.id, lesIndex)
                          }
                          onDragEnd={handleLessonDragEnd}
                        >
                          {/* Lesson Header */}
                          <div
                            className="curriculum-lesson-header"
                            onClick={() => handleToggleLessonExpand(sec.id, les.id)}
                            style={{ cursor: "pointer" }}
                            title="Click to toggle lesson editor"
                          >
                            <div className="curriculum-lesson-header__left">
                              <span
                                className="curriculum-drag-handle"
                                title="Drag to reorder lesson"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <DotsSixVertical size={18} />
                              </span>
                              <span className="curriculum-lesson-num">
                                {lesIndex + 1}
                              </span>
                              <span className="curriculum-lesson-title">
                                {les.title}
                              </span>
                            </div>
                            <div className="curriculum-lesson-header__right">
                              {les.contentType === "video" ? (
                                <span className="curriculum-type-badge">
                                  <PlayCircle size={14} weight="fill" /> Video
                                </span>
                              ) : (
                                <span className="curriculum-type-badge curriculum-type-badge--doc">
                                  <FileText size={14} weight="fill" /> Document / PDF
                                </span>
                              )}
                              <button
                                type="button"
                                className="curriculum-icon-btn curriculum-icon-btn--danger"
                                aria-label="Delete lesson"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteLesson(sec.id, les.id);
                                }}
                              >
                                <Trash size={16} />
                              </button>
                              <button
                                type="button"
                                className={`curriculum-icon-btn curriculum-caret-btn ${
                                  les.isExpanded ? "is-expanded" : ""
                                }`}
                                aria-label={
                                  les.isExpanded
                                    ? "Collapse lesson editor"
                                    : "Expand lesson editor"
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleLessonExpand(sec.id, les.id);
                                }}
                              >
                                <CaretDown size={16} weight="bold" />
                              </button>
                            </div>
                          </div>

                          {/* Expanded Lesson Editor with CSS transition */}
                          <div
                            className={`curriculum-lesson-editor-wrapper ${
                              les.isExpanded ? "is-open" : ""
                            }`}
                          >
                            <div className="curriculum-lesson-editor">
                              <div className="curriculum-editor-grid">
                                {/* Left column */}
                                <div className="curriculum-editor-left">
                                  {/* Lesson Title */}
                                  <div className="course-wizard-form-group">
                                    <label htmlFor={`les-title-${les.id}`}>
                                      Lesson Title <span className="req-star">*</span>
                                    </label>
                                    <div className="course-wizard-input-wrap">
                                      <input
                                        id={`les-title-${les.id}`}
                                        type="text"
                                        maxLength={120}
                                        value={les.title}
                                        onChange={(e) =>
                                          handleUpdateLesson(sec.id, les.id, {
                                            title: e.target.value,
                                          })
                                        }
                                        placeholder="e.g. Introduction to React Hooks"
                                      />
                                      <span className="course-wizard-char-count">
                                        {les.title.length} / 120
                                      </span>
                                    </div>
                                  </div>

                                  {/* Lesson Description Rich Editor Mock */}
                                  <div className="course-wizard-form-group">
                                    <label id={`les-desc-label-${les.id}`}>
                                      Lesson Description
                                    </label>
                                    <div className="course-wizard-editor">
                                      <div className="course-wizard-editor__toolbar">
                                        <div className="course-wizard-editor__select">
                                          <select aria-label="Text format">
                                            <option value="normal">Normal</option>
                                            <option value="h1">Heading 1</option>
                                            <option value="h2">Heading 2</option>
                                          </select>
                                        </div>
                                        <div className="course-wizard-editor__divider" />
                                        <button
                                          type="button"
                                          title="Bold"
                                          className="editor-btn"
                                          aria-label="Bold"
                                        >
                                          <TextB size={16} weight="bold" />
                                        </button>
                                        <button
                                          type="button"
                                          title="Italic"
                                          className="editor-btn"
                                          aria-label="Italic"
                                        >
                                          <TextItalic size={16} weight="bold" />
                                        </button>
                                        <div className="course-wizard-editor__divider" />
                                        <button
                                          type="button"
                                          title="Bullet List"
                                          className="editor-btn"
                                          aria-label="Bullet List"
                                        >
                                          <ListBullets size={16} />
                                        </button>
                                        <button
                                          type="button"
                                          title="Numbered List"
                                          className="editor-btn"
                                          aria-label="Numbered List"
                                        >
                                          <ListNumbers size={16} />
                                        </button>
                                        <button
                                          type="button"
                                          title="Checklist"
                                          className="editor-btn"
                                          aria-label="Checklist"
                                        >
                                          <Check size={16} weight="bold" />
                                        </button>
                                        <button
                                          type="button"
                                          title="Quote"
                                          className="editor-btn"
                                          aria-label="Quote"
                                        >
                                          <Quotes size={16} />
                                        </button>
                                      </div>
                                      <textarea
                                        className="course-wizard-editor__textarea"
                                        rows={5}
                                        maxLength={1500}
                                        value={les.description}
                                        onChange={(e) =>
                                          handleUpdateLesson(sec.id, les.id, {
                                            description: e.target.value,
                                          })
                                        }
                                        placeholder="Add a detailed description of what students will learn in this lesson..."
                                      />
                                      <div className="course-wizard-editor__footer">
                                        <span className="course-wizard-char-count">
                                          {les.description.length} / 1500
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Right column */}
                                <div className="curriculum-editor-right">
                                  {/* Content Type Selector */}
                                  <div className="course-wizard-form-group">
                                    <label>
                                      Content Type <span className="req-star">*</span>
                                    </label>
                                    <div className="curriculum-type-grid">
                                      <div
                                        className={`curriculum-type-card ${
                                          les.contentType === "video"
                                            ? "is-selected"
                                            : ""
                                        }`}
                                        onClick={() =>
                                          handleUpdateLesson(sec.id, les.id, {
                                            contentType: "video",
                                          })
                                        }
                                      >
                                        <div className="curriculum-type-card__radio">
                                          {les.contentType === "video" && (
                                            <div className="curriculum-type-card__radio-inner" />
                                          )}
                                        </div>
                                        <div className="curriculum-type-card__icon">
                                          <Video size={18} weight="fill" />
                                        </div>
                                        <div className="curriculum-type-card__info">
                                          <span className="curriculum-type-card__title">
                                            Video
                                          </span>
                                          <span className="curriculum-type-card__desc">
                                            Upload or select a video
                                          </span>
                                        </div>
                                      </div>

                                      <div
                                        className={`curriculum-type-card ${
                                          les.contentType === "document"
                                            ? "is-selected"
                                            : ""
                                        }`}
                                        onClick={() =>
                                          handleUpdateLesson(sec.id, les.id, {
                                            contentType: "document",
                                          })
                                        }
                                      >
                                        <div className="curriculum-type-card__radio">
                                          {les.contentType === "document" && (
                                            <div className="curriculum-type-card__radio-inner" />
                                          )}
                                        </div>
                                        <div className="curriculum-type-card__icon">
                                          <FileText size={18} weight="fill" />
                                        </div>
                                        <div className="curriculum-type-card__info">
                                          <span className="curriculum-type-card__title">
                                            Document / PDF
                                          </span>
                                          <span className="curriculum-type-card__desc">
                                            Upload PDF or document
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Content Source Controls (Video or Document) */}
                                  <div className="course-wizard-form-group">
                                    <label>
                                      {les.contentType === "video"
                                        ? "Video Source"
                                        : "Document / PDF Source"}{" "}
                                      <span className="req-star">*</span>
                                    </label>
                                    <div className="curriculum-source-actions">
                                      <button
                                        type="button"
                                        className="curriculum-upload-btn-primary"
                                      >
                                        <UploadSimple size={16} weight="bold" /> Upload
                                        New
                                      </button>
                                      <button
                                        type="button"
                                        className="curriculum-upload-btn-secondary"
                                      >
                                        {les.contentType === "video" ? (
                                          <PlayCircle size={16} />
                                        ) : (
                                          <FileText size={16} />
                                        )}{" "}
                                        Select from Media
                                      </button>
                                    </div>
                                  </div>

                                  {/* Lesson Resources Table */}
                                  <div className="course-wizard-form-group">
                                    <div className="curriculum-resources-header">
                                      <label>Lesson Resources</label>
                                      <div className="curriculum-source-actions">
                                        <button
                                          type="button"
                                          className="curriculum-upload-btn-primary"
                                          onClick={() =>
                                            handleAddLessonResource(sec.id, les.id)
                                          }
                                        >
                                          <UploadSimple size={16} weight="bold" /> Upload
                                          New
                                        </button>
                                        <button
                                          type="button"
                                          className="curriculum-upload-btn-secondary"
                                          onClick={() =>
                                            handleAddLessonResource(sec.id, les.id)
                                          }
                                        >
                                          <PlayCircle size={16} /> Select from Media
                                        </button>
                                      </div>
                                    </div>

                                    {les.resources.length > 0 ? (
                                      <table className="curriculum-resources-table">
                                        <thead>
                                          <tr>
                                            <th>File Name</th>
                                            <th>Type</th>
                                            <th>Size</th>
                                            <th>Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {les.resources.map((res) => (
                                            <tr key={res.id}>
                                              <td>
                                                <div className="curriculum-file-cell">
                                                  <FileText size={16} weight="fill" />
                                                  <span>{res.name}</span>
                                                </div>
                                              </td>
                                              <td>{res.type}</td>
                                              <td>{res.size}</td>
                                              <td>
                                                <button
                                                  type="button"
                                                  className="curriculum-icon-btn curriculum-icon-btn--danger"
                                                  onClick={() =>
                                                    handleRemoveLessonResource(
                                                      sec.id,
                                                      les.id,
                                                      res.id
                                                    )
                                                  }
                                                  aria-label="Remove resource"
                                                >
                                                  <X size={14} />
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    ) : (
                                      <p className="media-sub">
                                        No resources added to this lesson yet.
                                      </p>
                                    )}
                                  </div>

                                  <div className="curriculum-editor-save-row">
                                    <button
                                      type="button"
                                      className="curriculum-save-lesson-btn"
                                      onClick={() => handleSaveLesson(sec.id, les.id)}
                                    >
                                      Save Lesson
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add Lesson Action */}
                    <div className="curriculum-add-lesson-row">
                      <button
                        type="button"
                        className="curriculum-add-lesson-btn"
                        onClick={() => handleAddLesson(sec.id)}
                      >
                        <Plus size={16} weight="bold" /> Add Lesson
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="course-wizard-body">
            <section className="course-wizard-card">
              <div className="course-wizard-card__header">
                <h2>
                  {WIZARD_STEPS.find((s) => s.id === activeStep)?.label}
                </h2>
                <p>This section will allow configuring course {activeStep}.</p>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Persistent Shared Action Bar */}
      <footer className="course-wizard-footer">
        <div className="course-wizard-footer__actions">
          <button type="button" className="course-wizard-btn-ghost">
            <Eye size={16} /> Preview
          </button>
          <button type="button" className="course-wizard-btn-draft">
            <FloppyDisk size={16} /> Save Draft
          </button>
          <button type="button" className="course-wizard-btn-primary">
            {activeStep === "publish" ? "Publish Course" : "Save Changes"}
          </button>
        </div>
      </footer>
      {/* Reusable Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={deleteModalState.isOpen}
        title={deleteModalState.title}
        message={deleteModalState.message}
        onConfirm={deleteModalState.onConfirm}
        onClose={() => setDeleteModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
