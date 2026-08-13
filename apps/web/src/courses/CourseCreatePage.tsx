import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Eye,
  FloppyDisk,
  Image as ImageIcon,
  Lightning,
  ListBullets,
  ListNumbers,
  LockKey,
  Paperclip,
  PlayCircle,
  Quotes,
  Smiley,
  Sparkle,
  Tag,
  TextB,
  TextItalic,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { ThemedSelect } from "../ThemedSelect";
import type { NavigateTo } from "../routing/navigation";

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
              Add the essential details of your course. You can always edit
              these later.
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
                      <BookOpen size={15} /> 0 Sections
                    </span>
                    <span>
                      <BookOpen size={15} /> 0 Lessons
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
    </div>
  );
}
