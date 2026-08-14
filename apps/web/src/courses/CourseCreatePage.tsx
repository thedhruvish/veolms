import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Calendar,
  CaretDown,
  CaretRight,
  CaretUp,
  Certificate,
  ChartBar,
  ChatCircleText,
  Check,
  CheckCircle,
  Clock,
  DotsSixVertical,
  DotsThreeVertical,
  Export,
  Eye,
  FileText,
  FloppyDisk,
  Globe,
  Image as ImageIcon,
  Info,
  Lightning,
  ListBullets,
  ListNumbers,
  LockKey,
  Paperclip,
  PencilSimple,
  PlayCircle,
  Plus,
  Question,
  Quotes,
  RocketLaunch,
  Smiley,
  Sparkle,
  Tag,
  TextB,
  TextItalic,
  Trash,
  UploadSimple,
  UserPlus,
  Video,
  X,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { ThemedSelect } from "../ThemedSelect";
import type { NavigateTo } from "../routing/navigation";

import { ConfirmDeleteModal } from "../ConfirmDeleteModal";

export type CourseWizardStepId =
  "basics" | "curriculum" | "access-rules" | "pricing" | "extras" | "publish";

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
  const [slideDirection, setSlideDirection] = useState<"right" | "left">(
    "right",
  );

  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    width: number;
  }>({ left: 0, width: 0 });
  const tabRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const stepsNavRef = useRef<HTMLElement | null>(null);
  const [isNavMouseDown, setIsNavMouseDown] = useState(false);
  const [navStartX, setNavStartX] = useState(0);
  const [navScrollLeft, setNavScrollLeft] = useState(0);

  const handleNavMouseDown = (e: React.MouseEvent) => {
    if (!stepsNavRef.current) return;
    setIsNavMouseDown(true);
    setNavStartX(e.pageX - stepsNavRef.current.offsetLeft);
    setNavScrollLeft(stepsNavRef.current.scrollLeft);
  };

  const handleNavMouseLeave = () => {
    setIsNavMouseDown(false);
  };

  const handleNavMouseUp = () => {
    setIsNavMouseDown(false);
  };

  const handleNavMouseMove = (e: React.MouseEvent) => {
    if (!isNavMouseDown || !stepsNavRef.current) return;
    e.preventDefault();
    const x = e.pageX - stepsNavRef.current.offsetLeft;
    const walk = (x - navStartX) * 1.5;
    stepsNavRef.current.scrollLeft = navScrollLeft - walk;
  };

  useEffect(() => {
    const activeEl = tabRefs.current[activeStep];
    if (activeEl) {
      setIndicatorStyle({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
      });
      // Automatically scroll active tab into view on mobile/narrow screens
      if (stepsNavRef.current && activeEl) {
        const nav = stepsNavRef.current;
        const navWidth = nav.offsetWidth;
        const elLeft = activeEl.offsetLeft;
        const elWidth = activeEl.offsetWidth;
        if (elLeft < nav.scrollLeft || elLeft + elWidth > nav.scrollLeft + navWidth) {
          nav.scrollTo({
            left: elLeft - navWidth / 2 + elWidth / 2,
            behavior: "smooth",
          });
        }
      }
    }
  }, [activeStep]);

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

  // Access Rules interfaces
  type AccessType = "everyone" | "restricted";
  type AccessDurationMode = "lifetime" | "fixed" | "custom";
  type DurationUnit = "Days" | "Weeks" | "Months" | "Years";

  interface AccessRequirement {
    id: string;
    courseId: string;
  }

  interface AccessRulesState {
    accessType: AccessType;
    requirements: AccessRequirement[];
    durationMode: AccessDurationMode;
    fixedDurationValue: number;
    fixedDurationUnit: DurationUnit;
    customStartDate: string;
    customEndDate: string;
    enableQA: boolean;
    enableComments: boolean;
  }

  // Available prerequisite courses for dropdown
  const PREREQUISITE_COURSE_OPTIONS = [
    { value: "node-fundamentals", label: "Node.js Fundamentals" },
    { value: "js-basics", label: "JavaScript Basics & ES6+" },
    { value: "react-core", label: "React Core Architecture" },
    { value: "css-mastery", label: "Modern CSS & Responsive Web Design" },
  ];

  // Curriculum Step state
  const [sections, setSections] = useState<CurriculumSectionItem[]>([
    {
      id: "section-1",
      title: "Introduction to the Course",
      isExpanded: true,
      lessons: [],
    },
  ]);

  // Pricing interfaces
  type PricingType = "free" | "paid";

  interface PricingState {
    pricingType: PricingType;
    sellingPrice: string;
    originalPrice: string;
  }

  // Access Rules Step state
  const [accessRules, setAccessRules] = useState<AccessRulesState>({
    accessType: "restricted",
    requirements: [{ id: "req-1", courseId: "node-fundamentals" }],
    durationMode: "lifetime",
    fixedDurationValue: 30,
    fixedDurationUnit: "Days",
    customStartDate: "2026-08-12",
    customEndDate: "2026-09-12",
    enableQA: true,
    enableComments: true,
  });

  // Extras interfaces
  interface ExtrasInclusionItem {
    id: string;
    text: string;
  }

  type CertificateIssuanceType = "completion" | "percentage" | "custom";

  interface ExtrasState {
    inclusions: ExtrasInclusionItem[];
    enableCertificate: boolean;
    certificateTemplate: string;
    issuanceType: CertificateIssuanceType;
    minCompletionPercentage: number;
    customRuleText: string;
    autoEmailCertificate: boolean;
  }

  // Pricing Step state
  const [pricing, setPricing] = useState<PricingState>({
    pricingType: "paid",
    sellingPrice: "1999",
    originalPrice: "2999",
  });

  // Publish interfaces
  type CourseVisibility = "public" | "private" | "unlisted";
  type ScheduleOption = "now" | "later";

  interface PublishState {
    visibility: CourseVisibility;
    scheduleOption: ScheduleOption;
    scheduleDate: string;
    scheduleTime: string;
  }

  // Course Life Cycle state
  const [isPublished, setIsPublished] = useState<boolean>(false);

  // Publish Step state
  const [publishSettings, setPublishSettings] = useState<PublishState>({
    visibility: "public",
    scheduleOption: "now",
    scheduleDate: "2026-08-20",
    scheduleTime: "10:00",
  });

  const [publishValidationError, setPublishValidationError] = useState<
    string | null
  >(null);

  // Auto-hide validation error message after 3.5 seconds
  useEffect(() => {
    if (!publishValidationError) return;
    const timer = setTimeout(() => {
      setPublishValidationError(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [publishValidationError]);

  // Extras Step state
  const [extras, setExtras] = useState<ExtrasState>({
    inclusions: [
      { id: "inc-1", text: "Downloadable resources" },
      { id: "inc-2", text: "Certificate of completion" },
      { id: "inc-3", text: "Lifetime access" },
      { id: "inc-4", text: "Lifetime updates" },
    ],
    enableCertificate: true,
    certificateTemplate: "purple-certificate",
    issuanceType: "percentage",
    minCompletionPercentage: 95,
    customRuleText: "Complete all quizzes with > 80% score",
    autoEmailCertificate: true,
  });

  // Extras Inclusions Handlers
  const [draggedInclusionIndex, setDraggedInclusionIndex] = useState<
    number | null
  >(null);

  const handleAddInclusion = () => {
    setExtras((prev) => ({
      ...prev,
      inclusions: [
        ...prev.inclusions,
        {
          id: `inc-${Date.now()}`,
          text: `New Inclusion ${prev.inclusions.length + 1}`,
        },
      ],
    }));
  };

  const handleUpdateInclusionText = (id: string, text: string) => {
    setExtras((prev) => ({
      ...prev,
      inclusions: prev.inclusions.map((item) =>
        item.id === id ? { ...item, text } : item,
      ),
    }));
  };

  const handleDeleteInclusion = (id: string) => {
    setExtras((prev) => ({
      ...prev,
      inclusions: prev.inclusions.filter((item) => item.id !== id),
    }));
  };

  const handleInclusionDragStart = (index: number) => {
    setDraggedInclusionIndex(index);
  };

  const handleInclusionDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedInclusionIndex === null || draggedInclusionIndex === index)
      return;
    setExtras((prev) => {
      const copy = [...prev.inclusions];
      const [moved] = copy.splice(draggedInclusionIndex, 1);
      if (moved) {
        copy.splice(index, 0, moved);
      }
      return { ...prev, inclusions: copy };
    });
    setDraggedInclusionIndex(index);
  };

  const handleInclusionDragEnd = () => {
    setDraggedInclusionIndex(null);
  };

  // Certificate Handlers
  const handleToggleCertificate = () => {
    setExtras((prev) => ({
      ...prev,
      enableCertificate: !prev.enableCertificate,
    }));
  };

  const handleCertificateTemplateChange = (template: string) => {
    setExtras((prev) => ({ ...prev, certificateTemplate: template }));
  };

  const handleIssuanceTypeChange = (type: CertificateIssuanceType) => {
    setExtras((prev) => ({ ...prev, issuanceType: type }));
  };

  const handleMinPercentageChange = (val: number) => {
    const clamped = Math.min(100, Math.max(1, isNaN(val) ? 1 : val));
    setExtras((prev) => ({ ...prev, minCompletionPercentage: clamped }));
  };

  const handleCustomRuleTextChange = (text: string) => {
    setExtras((prev) => ({ ...prev, customRuleText: text }));
  };

  const handleToggleAutoEmailCertificate = () => {
    setExtras((prev) => ({
      ...prev,
      autoEmailCertificate: !prev.autoEmailCertificate,
    }));
  };

  // Pricing Handlers
  const handlePricingTypeChange = (type: PricingType) => {
    setPricing((prev) => ({ ...prev, pricingType: type }));
  };

  const handleSellingPriceChange = (val: string) => {
    setPricing((prev) => ({ ...prev, sellingPrice: val }));
  };

  const handleOriginalPriceChange = (val: string) => {
    setPricing((prev) => ({ ...prev, originalPrice: val }));
  };

  // Access Rules State Handlers
  const handleAccessTypeChange = (type: AccessType) => {
    setAccessRules((prev) => ({ ...prev, accessType: type }));
  };

  const handleAddRequirement = () => {
    setAccessRules((prev) => ({
      ...prev,
      requirements: [
        ...prev.requirements,
        {
          id: `req-${Date.now()}`,
          courseId:
            PREREQUISITE_COURSE_OPTIONS[0]?.value || "node-fundamentals",
        },
      ],
    }));
  };

  const handleRemoveRequirement = (id: string) => {
    setAccessRules((prev) => ({
      ...prev,
      requirements: prev.requirements.filter((r) => r.id !== id),
    }));
  };

  const handleRequirementCourseChange = (id: string, courseId: string) => {
    setAccessRules((prev) => ({
      ...prev,
      requirements: prev.requirements.map((r) =>
        r.id === id ? { ...r, courseId } : r,
      ),
    }));
  };

  const handleDurationModeChange = (mode: AccessDurationMode) => {
    setAccessRules((prev) => ({ ...prev, durationMode: mode }));
  };

  const handleFixedDurationValueChange = (val: number) => {
    setAccessRules((prev) => ({
      ...prev,
      fixedDurationValue: Math.max(1, val || 1),
    }));
  };

  const handleFixedDurationUnitChange = (unit: DurationUnit) => {
    setAccessRules((prev) => ({ ...prev, fixedDurationUnit: unit }));
  };

  const handleCustomStartDateChange = (date: string) => {
    setAccessRules((prev) => ({ ...prev, customStartDate: date }));
  };

  const handleCustomEndDateChange = (date: string) => {
    setAccessRules((prev) => ({ ...prev, customEndDate: date }));
  };

  const handleToggleQA = () => {
    setAccessRules((prev) => ({ ...prev, enableQA: !prev.enableQA }));
  };

  const handleToggleComments = () => {
    setAccessRules((prev) => ({
      ...prev,
      enableComments: !prev.enableComments,
    }));
  };

  // Drag and Drop state for Sections & Lessons
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(
    null,
  );
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
      prev.map((s) =>
        s.id === sectionId ? { ...s, isExpanded: !s.isExpanded } : s,
      ),
    );
  };

  const handleStartEditSectionTitle = (sectionId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, isEditingTitle: true } : s,
      ),
    );
  };

  const handleSaveSectionTitle = (sectionId: string, newTitle: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, title: newTitle.trim() || s.title, isEditingTitle: false }
          : s,
      ),
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
      }),
    );
  };

  const handleToggleLessonExpand = (sectionId: string, lessonId: string) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) =>
            l.id === lessonId ? { ...l, isExpanded: !l.isExpanded } : l,
          ),
        };
      }),
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
          }),
        );
      },
    });
  };

  const handleUpdateLesson = (
    sectionId: string,
    lessonId: string,
    updates: Partial<CurriculumLessonItem>,
  ) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) =>
            l.id === lessonId ? { ...l, ...updates } : l,
          ),
        };
      }),
    );
  };

  const handleSaveLesson = (sectionId: string, lessonId: string) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) =>
            l.id === lessonId ? { ...l, isExpanded: false } : l,
          ),
        };
      }),
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
      }),
    );
  };

  const handleRemoveLessonResource = (
    sectionId: string,
    lessonId: string,
    resourceId: string,
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
      }),
    );
  };

  // Lesson Drag and Drop handlers
  const handleLessonDragStart = (sectionId: string, lessonIndex: number) => {
    setDraggedLessonState({ sectionId, lessonIndex });
  };

  const handleLessonDragOver = (
    e: React.DragEvent,
    targetSectionId: string,
    targetLessonIndex: number,
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
        1,
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
  const totalLessons = sections.reduce(
    (acc, sec) => acc + sec.lessons.length,
    0,
  );

  // Derived Checklist Validation
  const isBasicsValid =
    courseTitle.trim().length > 0 && courseDescription.trim().length > 0;
  const isCurriculumValid = totalSections > 0;
  const isAccessRulesValid =
    accessRules.accessType === "everyone" ||
    accessRules.requirements.length > 0;
  const isPricingValid =
    pricing.pricingType === "free" ||
    parseFloat(pricing.sellingPrice.replace(/,/g, "")) > 0;
  const isExtrasValid = true;

  const isCourseReadyToPublish =
    isBasicsValid &&
    isCurriculumValid &&
    isAccessRulesValid &&
    isPricingValid &&
    isExtrasValid;

  const handleFinalPublishCourse = () => {
    if (!isCourseReadyToPublish) {
      if (!isBasicsValid)
        setPublishValidationError(
          "Please fill out required Basic Information fields (Title and Description).",
        );
      else if (!isCurriculumValid)
        setPublishValidationError(
          "Please add at least one Section to the Curriculum.",
        );
      else if (!isAccessRulesValid)
        setPublishValidationError(
          "Please configure at least one prerequisite requirement or select Everyone.",
        );
      else if (!isPricingValid)
        setPublishValidationError(
          "Please set a valid Selling Price for paid course.",
        );
      return;
    }

    setPublishValidationError(null);
    setIsPublished(true);
    if (typeof window !== "undefined") {
      alert(
        isPublished
          ? "Course updated successfully!"
          : "Course successfully published!",
      );
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
              <h1>{isPublished ? "Edit Course" : "Create New Course"}</h1>
              <span
                className={`course-wizard-status-badge ${isPublished ? "is-published" : ""}`}
              >
                {isPublished ? "Published" : "Draft"}
              </span>
            </div>
            <p>
              {activeStep === "curriculum"
                ? "Build your course structure by adding sections and lessons."
                : activeStep === "access-rules"
                  ? "Control who can access this course and how long their access lasts."
                  : activeStep === "pricing"
                    ? "Set how learners will purchase this course."
                    : activeStep === "extras"
                      ? "Add extra information and settings to enhance your course."
                      : activeStep === "publish"
                        ? "Review your course and publish it when you're ready."
                        : "Add the essential details of your course. You can always edit these later."}
            </p>
          </div>
        </div>

        {/* Wizard Steps Navigation */}
        <nav
          ref={stepsNavRef}
          className="course-wizard-steps"
          aria-label="Course creation steps"
          onMouseDown={handleNavMouseDown}
          onMouseLeave={handleNavMouseLeave}
          onMouseUp={handleNavMouseUp}
          onMouseMove={handleNavMouseMove}
        >
          <div
            className="course-wizard-active-indicator"
            style={{
              transform: `translateX(${indicatorStyle.left}px)`,
              width: `${indicatorStyle.width}px`,
            }}
          />
          {WIZARD_STEPS.map((step, idx) => {
            const Icon = step.Icon;
            const isActive = activeStep === step.id;
            return (
              <button
                key={step.id}
                ref={(el) => {
                  tabRefs.current[step.id] = el;
                }}
                type="button"
                className={`course-wizard-step-tab ${isActive ? "is-active" : ""}`}
                onClick={() => {
                  const currentIdx = WIZARD_STEPS.findIndex(
                    (s) => s.id === activeStep,
                  );
                  if (idx > currentIdx) setSlideDirection("right");
                  else if (idx < currentIdx) setSlideDirection("left");
                  setActiveStep(step.id);
                }}
              >
                <Icon size={18} weight={isActive ? "fill" : "regular"} />
                <span>{step.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Scrollable Step Content Region */}
      <div
        className={`course-wizard-content slide-from-${slideDirection}`}
        key={activeStep}
      >
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
                  Organize your course into sections and lessons. You can
                  reorder them anytime.
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
                                (e.target as HTMLInputElement).value,
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
                      aria-label={
                        sec.isExpanded ? "Collapse section" : "Expand section"
                      }
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
                            onClick={() =>
                              handleToggleLessonExpand(sec.id, les.id)
                            }
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
                                  <FileText size={14} weight="fill" /> Document
                                  / PDF
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
                                      Lesson Title{" "}
                                      <span className="req-star">*</span>
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
                                            <option value="normal">
                                              Normal
                                            </option>
                                            <option value="h1">
                                              Heading 1
                                            </option>
                                            <option value="h2">
                                              Heading 2
                                            </option>
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
                                      Content Type{" "}
                                      <span className="req-star">*</span>
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
                                        <UploadSimple size={16} weight="bold" />{" "}
                                        Upload New
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
                                            handleAddLessonResource(
                                              sec.id,
                                              les.id,
                                            )
                                          }
                                        >
                                          <UploadSimple
                                            size={16}
                                            weight="bold"
                                          />{" "}
                                          Upload New
                                        </button>
                                        <button
                                          type="button"
                                          className="curriculum-upload-btn-secondary"
                                          onClick={() =>
                                            handleAddLessonResource(
                                              sec.id,
                                              les.id,
                                            )
                                          }
                                        >
                                          <PlayCircle size={16} /> Select from
                                          Media
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
                                                  <FileText
                                                    size={16}
                                                    weight="fill"
                                                  />
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
                                                      res.id,
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
                                      onClick={() =>
                                        handleSaveLesson(sec.id, les.id)
                                      }
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
        ) : activeStep === "access-rules" ? (
          <div className="access-rules-container">
            {/* Top Grid: 1. Who can access & 2. Access duration */}
            <div className="access-rules-top-grid">
              {/* Card 1: Who can access this course? */}
              <div className="access-rules-card">
                <div className="access-rules-card__header">
                  <h3>1. Who can access this course?</h3>
                  <p>Choose who is allowed to access this course.</p>
                </div>

                <div className="access-rules-options-group">
                  {/* Radio option: Everyone */}
                  <label
                    className={`access-rules-radio-option ${
                      accessRules.accessType === "everyone" ? "is-selected" : ""
                    }`}
                    onClick={() => handleAccessTypeChange("everyone")}
                  >
                    <div className="access-rules-radio-circle">
                      {accessRules.accessType === "everyone" && (
                        <div className="access-rules-radio-dot" />
                      )}
                    </div>
                    <div className="access-rules-radio-text">
                      <strong>Everyone</strong>
                      <p>
                        Anyone with access to the platform can access this
                        course.
                      </p>
                    </div>
                  </label>

                  {/* Radio option: Restricted access */}
                  <label
                    className={`access-rules-radio-option ${
                      accessRules.accessType === "restricted"
                        ? "is-selected"
                        : ""
                    }`}
                    onClick={() => handleAccessTypeChange("restricted")}
                  >
                    <div className="access-rules-radio-circle">
                      {accessRules.accessType === "restricted" && (
                        <div className="access-rules-radio-dot" />
                      )}
                    </div>
                    <div className="access-rules-radio-text">
                      <strong>Restricted access</strong>
                      <p>
                        Only users who meet the selected requirements can access
                        this course.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Conditional Requirements Box */}
                {accessRules.accessType === "restricted" && (
                  <div className="access-rules-req-box">
                    <div className="access-rules-req-header">
                      <label>Access requirement</label>
                      <p>Users must have access to:</p>
                    </div>

                    <div className="access-rules-req-list">
                      {accessRules.requirements.map((req) => (
                        <div key={req.id} className="access-rules-req-row">
                          <ThemedSelect
                            value={req.courseId}
                            onValueChange={(val) =>
                              handleRequirementCourseChange(req.id, val)
                            }
                            options={PREREQUISITE_COURSE_OPTIONS.map((c) => [
                              c.value,
                              c.label,
                            ])}
                            ariaLabel="Select prerequisite course requirement"
                            triggerClassName="course-wizard-select-trigger access-rules-req-select"
                          />
                          {accessRules.requirements.length > 1 && (
                            <button
                              type="button"
                              className="curriculum-icon-btn curriculum-icon-btn--danger"
                              aria-label="Remove requirement"
                              title="Remove requirement"
                              onClick={() => handleRemoveRequirement(req.id)}
                            >
                              <Trash size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="access-rules-add-req-btn"
                      onClick={handleAddRequirement}
                    >
                      <Plus size={15} weight="bold" /> Add another requirement
                    </button>
                  </div>
                )}
              </div>

              {/* Card 2: Access duration */}
              <div className="access-rules-card">
                <div className="access-rules-card__header">
                  <h3>2. Access duration</h3>
                  <p>Set how long learners can access this course.</p>
                </div>

                <div className="access-rules-options-group">
                  {/* Option 1: Lifetime access */}
                  <div
                    className={`access-rules-radio-option ${
                      accessRules.durationMode === "lifetime"
                        ? "is-selected"
                        : ""
                    }`}
                    onClick={() => handleDurationModeChange("lifetime")}
                  >
                    <div className="access-rules-radio-circle">
                      {accessRules.durationMode === "lifetime" && (
                        <div className="access-rules-radio-dot" />
                      )}
                    </div>
                    <div className="access-rules-radio-text">
                      <strong>Lifetime access</strong>
                      <p>Learners can access this course forever.</p>
                    </div>
                  </div>

                  {/* Option 2: Fixed duration */}
                  <div
                    className={`access-rules-radio-option ${
                      accessRules.durationMode === "fixed" ? "is-selected" : ""
                    }`}
                    onClick={() => handleDurationModeChange("fixed")}
                  >
                    <div className="access-rules-radio-circle">
                      {accessRules.durationMode === "fixed" && (
                        <div className="access-rules-radio-dot" />
                      )}
                    </div>
                    <div className="access-rules-radio-text">
                      <strong>Fixed duration</strong>
                      <p>
                        Set a duration for how long learners can access this
                        course.
                      </p>

                      {accessRules.durationMode === "fixed" && (
                        <div
                          className="access-rules-fixed-inputs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="number"
                            className="access-rules-number-input"
                            min={1}
                            value={accessRules.fixedDurationValue}
                            onChange={(e) =>
                              handleFixedDurationValueChange(
                                parseInt(e.target.value, 10),
                              )
                            }
                          />
                          <ThemedSelect
                            value={accessRules.fixedDurationUnit}
                            onValueChange={(val) =>
                              handleFixedDurationUnitChange(val as DurationUnit)
                            }
                            options={[
                              ["Days", "Days"],
                              ["Weeks", "Weeks"],
                              ["Months", "Months"],
                              ["Years", "Years"],
                            ]}
                            ariaLabel="Select duration unit"
                            triggerClassName="course-wizard-select-trigger access-rules-unit-select"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Option 3: Custom expiration */}
                  <div
                    className={`access-rules-radio-option ${
                      accessRules.durationMode === "custom" ? "is-selected" : ""
                    }`}
                    onClick={() => handleDurationModeChange("custom")}
                  >
                    <div className="access-rules-radio-circle">
                      {accessRules.durationMode === "custom" && (
                        <div className="access-rules-radio-dot" />
                      )}
                    </div>
                    <div className="access-rules-radio-text">
                      <strong>Custom expiration</strong>
                      <p>Set a specific start and end date for access.</p>

                      {accessRules.durationMode === "custom" && (
                        <div
                          className="access-rules-dates-row"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="access-rules-date-group">
                            <label>Start date</label>
                            <input
                              type="date"
                              className="access-rules-date-input"
                              value={accessRules.customStartDate}
                              onChange={(e) =>
                                handleCustomStartDateChange(e.target.value)
                              }
                            />
                          </div>

                          <div className="access-rules-date-arrow">
                            <ArrowRight size={18} />
                          </div>

                          <div className="access-rules-date-group">
                            <label>End date</label>
                            <input
                              type="date"
                              className="access-rules-date-input"
                              value={accessRules.customEndDate}
                              onChange={(e) =>
                                handleCustomEndDateChange(e.target.value)
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Card: 3. Learner interactions */}
            <div className="access-rules-card access-rules-card--full">
              <div className="access-rules-card__header">
                <h3>3. Learner interactions</h3>
                <p>Manage how learners can interact within this course.</p>
              </div>

              <div className="access-rules-toggles-list">
                {/* Toggle 1: Q&A */}
                <div className="access-rules-toggle-row">
                  <div className="access-rules-toggle-info">
                    <div className="access-rules-toggle-icon">
                      <Question size={20} weight="bold" />
                    </div>
                    <div>
                      <strong>Q&A</strong>
                      <p>Allow learners to ask questions about lessons.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`access-rules-switch ${
                      accessRules.enableQA ? "is-active" : ""
                    }`}
                    onClick={handleToggleQA}
                    role="switch"
                    aria-checked={accessRules.enableQA}
                    aria-label="Toggle Q&A"
                  >
                    <div className="access-rules-switch-thumb" />
                  </button>
                </div>

                {/* Toggle 2: Comments */}
                <div className="access-rules-toggle-row">
                  <div className="access-rules-toggle-info">
                    <div className="access-rules-toggle-icon">
                      <ChatCircleText size={20} weight="fill" />
                    </div>
                    <div>
                      <strong>Comments</strong>
                      <p>Allow learners to comment on course content.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`access-rules-switch ${
                      accessRules.enableComments ? "is-active" : ""
                    }`}
                    onClick={handleToggleComments}
                    role="switch"
                    aria-checked={accessRules.enableComments}
                    aria-label="Toggle Comments"
                  >
                    <div className="access-rules-switch-thumb" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : activeStep === "pricing" ? (
          <div className="pricing-container">
            {/* Top 2-Column Grid: 1. Course pricing & 2. Price details */}
            <div className="pricing-top-grid">
              {/* Card 1: Course pricing */}
              <div className="pricing-card">
                <div className="pricing-card__header">
                  <h3>1. Course pricing</h3>
                  <p>Choose how you want to sell this course.</p>
                </div>

                <div className="pricing-options-group">
                  {/* Radio Option: Free */}
                  <div
                    className={`pricing-radio-option ${
                      pricing.pricingType === "free" ? "is-selected" : ""
                    }`}
                    onClick={() => handlePricingTypeChange("free")}
                  >
                    <div className="pricing-radio-circle">
                      {pricing.pricingType === "free" && (
                        <div className="pricing-radio-dot" />
                      )}
                    </div>
                    <div className="pricing-radio-text">
                      <strong>Free</strong>
                      <p>
                        Anyone who can access the course can enroll for free.
                      </p>
                    </div>
                  </div>

                  {/* Radio Option: Paid */}
                  <div
                    className={`pricing-radio-option ${
                      pricing.pricingType === "paid" ? "is-selected" : ""
                    }`}
                    onClick={() => handlePricingTypeChange("paid")}
                  >
                    <div className="pricing-radio-circle">
                      {pricing.pricingType === "paid" && (
                        <div className="pricing-radio-dot" />
                      )}
                    </div>
                    <div className="pricing-radio-text">
                      <strong>Paid</strong>
                      <p>Learners must purchase the course to get access.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Price details */}
              <div
                className={`pricing-card ${
                  pricing.pricingType === "free" ? "is-disabled" : ""
                }`}
              >
                <div className="pricing-card__header">
                  <h3>2. Price details</h3>
                  <p>Set the pricing for your course.</p>
                </div>

                <div className="pricing-fields-group">
                  {/* Selling Price Field */}
                  <div className="course-wizard-form-group">
                    <label htmlFor="selling-price">
                      Selling price <span className="req-star">*</span>
                    </label>
                    <div className="pricing-input-prefix-wrap">
                      <span className="pricing-currency-prefix">₹</span>
                      <input
                        id="selling-price"
                        type="text"
                        disabled={pricing.pricingType === "free"}
                        value={pricing.sellingPrice}
                        onChange={(e) =>
                          handleSellingPriceChange(e.target.value)
                        }
                        placeholder="1,999"
                      />
                    </div>
                    <p className="pricing-input-hint">
                      This is the price learners will pay.
                    </p>
                  </div>

                  {/* Original Price Field */}
                  <div className="course-wizard-form-group">
                    <label htmlFor="original-price">Original price</label>
                    <div className="pricing-input-prefix-wrap">
                      <span className="pricing-currency-prefix">₹</span>
                      <input
                        id="original-price"
                        type="text"
                        disabled={pricing.pricingType === "free"}
                        value={pricing.originalPrice}
                        onChange={(e) =>
                          handleOriginalPriceChange(e.target.value)
                        }
                        placeholder="2,999"
                      />
                    </div>
                    <p className="pricing-input-hint">
                      Enter original price to show discount.
                    </p>
                  </div>

                  {/* Dynamic Discount Calculation Badge */}
                  {(() => {
                    const sell = parseFloat(
                      pricing.sellingPrice.replace(/,/g, ""),
                    );
                    const orig = parseFloat(
                      pricing.originalPrice.replace(/,/g, ""),
                    );
                    let discountPercent = 0;
                    let isValidDiscount = false;

                    if (
                      !isNaN(sell) &&
                      !isNaN(orig) &&
                      sell > 0 &&
                      orig > sell
                    ) {
                      discountPercent = Math.round(
                        ((orig - sell) / orig) * 100,
                      );
                      isValidDiscount = discountPercent > 0;
                    }

                    return (
                      <div className="pricing-discount-row">
                        <div
                          className={`pricing-discount-badge ${
                            isValidDiscount && pricing.pricingType === "paid"
                              ? "is-active"
                              : ""
                          }`}
                        >
                          <Tag size={15} weight="bold" />
                          <span>
                            {isValidDiscount && pricing.pricingType === "paid"
                              ? `${discountPercent}% OFF`
                              : "0% OFF"}
                          </span>
                        </div>
                        <span className="pricing-discount-label">
                          Discount is calculated automatically.
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Bottom Card: Coupons Banner */}
            <div className="pricing-coupons-card">
              <div className="pricing-coupons-left">
                <div className="pricing-coupons-icon">
                  <Info size={20} weight="bold" />
                </div>
                <div>
                  <strong>Coupons</strong>
                  <p>
                    Create and manage coupon codes separately from the Coupons
                    section.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="pricing-coupons-btn"
                onClick={() => {
                  if (onNavigatePage) {
                    onNavigatePage("settings");
                  }
                }}
              >
                Go to Coupons <ArrowUpRight size={16} weight="bold" />
              </button>
            </div>
          </div>
        ) : activeStep === "extras" ? (
          <div className="extras-container">
            {/* Top 2-Column Grid: 1. Certificates & 2. This course includes */}
            <div className="extras-top-grid">
              {/* Card 1: Certificates */}
              <div className="extras-card">
                <div className="extras-card__header">
                  <h3>1. Certificates</h3>
                  <p>
                    Configure how certificates will be issued for this course.
                  </p>
                </div>

                {/* Enable Certificate Toggle Row */}
                <div className="extras-cert-toggle-row">
                  <div>
                    <strong>Enable certificate</strong>
                    <p>Issue certificates to learners on course completion.</p>
                  </div>
                  <button
                    type="button"
                    className={`access-rules-switch ${
                      extras.enableCertificate ? "is-active" : ""
                    }`}
                    onClick={handleToggleCertificate}
                    role="switch"
                    aria-checked={extras.enableCertificate}
                    aria-label="Toggle certificate"
                  >
                    <div className="access-rules-switch-thumb" />
                  </button>
                </div>

                {/* Certificate Configuration Controls */}
                <div
                  className={`extras-cert-controls ${
                    !extras.enableCertificate ? "is-disabled" : ""
                  }`}
                >
                  {/* Template Selector */}
                  <div className="course-wizard-form-group">
                    <label>Certificate template</label>
                    <p className="extras-control-sub">
                      Choose a layout for your certificate.
                    </p>
                    <ThemedSelect
                      value={extras.certificateTemplate}
                      onValueChange={handleCertificateTemplateChange}
                      options={[
                        ["purple-certificate", "Modern Purple Certificate"],
                        ["blue-certificate", "Classic Blue Certificate"],
                        ["dark-certificate", "Minimal Dark Certificate"],
                      ]}
                      ariaLabel="Select certificate template"
                      triggerClassName="course-wizard-select-trigger"
                    />
                  </div>

                  {/* Certificate Issuance Options */}
                  <div className="course-wizard-form-group">
                    <label>Certificate issuance</label>
                    <p className="extras-control-sub">
                      Choose when the certificate should be issued.
                    </p>

                    <div className="extras-issuance-options">
                      {/* Option 1: On course completion */}
                      <div
                        className={`access-rules-radio-option ${
                          extras.issuanceType === "completion"
                            ? "is-selected"
                            : ""
                        }`}
                        onClick={() => handleIssuanceTypeChange("completion")}
                      >
                        <div className="access-rules-radio-circle">
                          {extras.issuanceType === "completion" && (
                            <div className="access-rules-radio-dot" />
                          )}
                        </div>
                        <div className="access-rules-radio-text">
                          <strong>On course completion</strong>
                          <p>
                            Issue certificate when the learner completes all
                            lessons.
                          </p>
                        </div>
                      </div>

                      {/* Option 2: Minimum completion percentage */}
                      <div
                        className={`access-rules-radio-option ${
                          extras.issuanceType === "percentage"
                            ? "is-selected"
                            : ""
                        }`}
                        onClick={() => handleIssuanceTypeChange("percentage")}
                      >
                        <div className="access-rules-radio-circle">
                          {extras.issuanceType === "percentage" && (
                            <div className="access-rules-radio-dot" />
                          )}
                        </div>
                        <div className="access-rules-radio-text">
                          <div className="extras-percentage-header">
                            <strong>Minimum completion percentage</strong>
                            {extras.issuanceType === "percentage" && (
                              <div
                                className="extras-percentage-input-wrap"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="number"
                                  className="access-rules-number-input"
                                  min={1}
                                  max={100}
                                  value={extras.minCompletionPercentage}
                                  onChange={(e) =>
                                    handleMinPercentageChange(
                                      parseInt(e.target.value, 10),
                                    )
                                  }
                                />
                                <span className="extras-percent-symbol">%</span>
                              </div>
                            )}
                          </div>
                          <p>
                            Issue certificate when learner reaches the selected
                            percentage.
                          </p>
                        </div>
                      </div>

                      {/* Option 3: Custom rule */}
                      <div
                        className={`access-rules-radio-option ${
                          extras.issuanceType === "custom" ? "is-selected" : ""
                        }`}
                        onClick={() => handleIssuanceTypeChange("custom")}
                      >
                        <div className="access-rules-radio-circle">
                          {extras.issuanceType === "custom" && (
                            <div className="access-rules-radio-dot" />
                          )}
                        </div>
                        <div className="access-rules-radio-text">
                          <strong>Custom rule</strong>
                          <p>
                            Define your own custom rule for certificate
                            issuance.
                          </p>

                          {extras.issuanceType === "custom" && (
                            <div
                              className="extras-custom-rule-input-wrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                className="extras-custom-rule-input"
                                value={extras.customRuleText}
                                onChange={(e) =>
                                  handleCustomRuleTextChange(e.target.value)
                                }
                                placeholder="e.g. Complete all quizzes with > 80% score"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Delivery Toggle Row */}
                  <div className="extras-delivery-toggle-row">
                    <div>
                      <strong>Delivery</strong>
                      <p>Automatically email the certificate to learners.</p>
                    </div>
                    <button
                      type="button"
                      className={`access-rules-switch ${
                        extras.autoEmailCertificate ? "is-active" : ""
                      }`}
                      onClick={handleToggleAutoEmailCertificate}
                      role="switch"
                      aria-checked={extras.autoEmailCertificate}
                      aria-label="Toggle certificate delivery"
                    >
                      <div className="access-rules-switch-thumb" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Card 2: This course includes */}
              <div className="extras-card">
                <div className="extras-card__header">
                  <h3>2. This course includes</h3>
                  <p>These details are calculated from your curriculum.</p>
                </div>

                {/* Derived Live Stats Summary Grid */}
                <div className="extras-stats-grid">
                  <div className="extras-stat-box">
                    <div className="extras-stat-icon">
                      <BookOpen size={20} weight="fill" />
                    </div>
                    <div className="extras-stat-info">
                      <strong>{totalSections}</strong>
                      <span>Sections</span>
                    </div>
                  </div>

                  <div className="extras-stat-box">
                    <div className="extras-stat-icon extras-stat-icon--purple">
                      <PlayCircle size={20} weight="fill" />
                    </div>
                    <div className="extras-stat-info">
                      <strong>{totalLessons}</strong>
                      <span>Lessons</span>
                    </div>
                  </div>

                  <div className="extras-stat-box">
                    <div className="extras-stat-icon extras-stat-icon--blue">
                      <Clock size={20} weight="bold" />
                    </div>
                    <div className="extras-stat-info">
                      <strong>9h 24m</strong>
                      <span>Content length</span>
                    </div>
                  </div>
                </div>

                {/* Additional Inclusions Section */}
                <div className="extras-inclusions-section">
                  <div className="extras-inclusions-header">
                    <h4>Additional inclusions</h4>
                    <p>
                      Add any additional benefits your learners will get with
                      this course.
                    </p>
                  </div>

                  <div className="extras-inclusions-list">
                    {extras.inclusions.map((item, incIndex) => (
                      <div
                        key={item.id}
                        className="extras-inclusion-row"
                        draggable
                        onDragStart={() => handleInclusionDragStart(incIndex)}
                        onDragOver={(e) => handleInclusionDragOver(e, incIndex)}
                        onDragEnd={handleInclusionDragEnd}
                      >
                        <span
                          className="curriculum-drag-handle"
                          title="Drag to reorder inclusion"
                        >
                          <DotsSixVertical size={18} />
                        </span>
                        <input
                          type="text"
                          className="extras-inclusion-input"
                          value={item.text}
                          onChange={(e) =>
                            handleUpdateInclusionText(item.id, e.target.value)
                          }
                          placeholder="e.g. Downloadable resources"
                        />
                        <button
                          type="button"
                          className="curriculum-icon-btn curriculum-icon-btn--danger"
                          aria-label="Remove inclusion"
                          title="Remove inclusion"
                          onClick={() => handleDeleteInclusion(item.id)}
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="extras-add-inclusion-btn"
                    onClick={handleAddInclusion}
                  >
                    <Plus size={15} weight="bold" /> Add inclusion
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : activeStep === "publish" ? (
          <div className="publish-container">
            {/* Top 2-Column Grid: 1. Publish settings & 2. Final checklist */}
            <div className="publish-top-grid">
              {/* Card 1: Publish settings */}
              <div className="publish-card">
                <div className="publish-card__header">
                  <h3>1. Publish settings</h3>
                  <p>Choose when and how your course becomes visible.</p>
                </div>

                {/* Informational Course Status Display */}
                <div className="publish-form-group">
                  <label>Course status</label>
                  <div className="publish-status-display">
                    <span
                      className={`publish-status-tag ${isPublished ? "is-published" : "is-draft"}`}
                    >
                      {isPublished ? "Published" : "Draft"}
                    </span>
                  </div>
                  <p className="publish-status-hint">
                    {isPublished
                      ? "Your course is currently published and visible to students according to your settings."
                      : "Your course is currently a draft and hasn't been published yet."}
                  </p>
                </div>

                {/* Course visibility select */}
                <div className="publish-form-group">
                  <label>Course visibility</label>
                  <ThemedSelect
                    value={publishSettings.visibility}
                    onValueChange={(val) =>
                      setPublishSettings((prev) => ({
                        ...prev,
                        visibility: val as CourseVisibility,
                      }))
                    }
                    options={[
                      [
                        "public",
                        "Public — Anyone on the platform can discover and enroll in this course.",
                      ],
                      [
                        "private",
                        "Private — Only invited students can access this course.",
                      ],
                      [
                        "unlisted",
                        "Unlisted — Only users with a direct link can view this course.",
                      ],
                    ]}
                    ariaLabel="Select course visibility"
                    triggerClassName="course-wizard-select-trigger"
                  />
                </div>

                {/* Publish on radio options */}
                <div className="publish-form-group">
                  <label>Publish on</label>

                  <div className="publish-options-group">
                    {/* Option 1: Publish now */}
                    <div
                      className={`access-rules-radio-option ${
                        publishSettings.scheduleOption === "now"
                          ? "is-selected"
                          : ""
                      }`}
                      onClick={() =>
                        setPublishSettings((prev) => ({
                          ...prev,
                          scheduleOption: "now",
                        }))
                      }
                    >
                      <div className="access-rules-radio-circle">
                        {publishSettings.scheduleOption === "now" && (
                          <div className="access-rules-radio-dot" />
                        )}
                      </div>
                      <div className="access-rules-radio-text">
                        <strong>Publish now</strong>
                        <p>Make this course live immediately.</p>
                      </div>
                    </div>

                    {/* Option 2: Schedule for later */}
                    <div
                      className={`access-rules-radio-option ${
                        publishSettings.scheduleOption === "later"
                          ? "is-selected"
                          : ""
                      }`}
                      onClick={() =>
                        setPublishSettings((prev) => ({
                          ...prev,
                          scheduleOption: "later",
                        }))
                      }
                    >
                      <div className="access-rules-radio-circle">
                        {publishSettings.scheduleOption === "later" && (
                          <div className="access-rules-radio-dot" />
                        )}
                      </div>
                      <div className="access-rules-radio-text">
                        <strong>Schedule for later</strong>
                        <p>Choose a future date and time to publish.</p>

                        {publishSettings.scheduleOption === "later" && (
                          <div
                            className="publish-schedule-inputs-row"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="publish-date-input-wrap">
                              <Calendar
                                size={16}
                                className="publish-input-icon"
                              />
                              <input
                                type="date"
                                className="access-rules-date-input"
                                value={publishSettings.scheduleDate}
                                onChange={(e) =>
                                  setPublishSettings((prev) => ({
                                    ...prev,
                                    scheduleDate: e.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div className="publish-date-input-wrap">
                              <Clock size={16} className="publish-input-icon" />
                              <input
                                type="time"
                                className="access-rules-date-input"
                                value={publishSettings.scheduleTime}
                                onChange={(e) =>
                                  setPublishSettings((prev) => ({
                                    ...prev,
                                    scheduleTime: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Access rules informational banner */}
                <div className="publish-info-box">
                  <Info size={18} weight="bold" className="publish-info-icon" />
                  <p>
                    Students will only see this course if they meet the access
                    rules you have configured.
                  </p>
                </div>
              </div>

              {/* Card 2: Final checklist & Ready-to-publish */}
              <div className="publish-card">
                <div className="publish-card__header">
                  <h3>2. Final checklist</h3>
                  <p>Make sure everything is ready to go live.</p>
                </div>

                {/* Checklist items list */}
                <div className="publish-checklist-list">
                  {/* Checklist Item: Basics */}
                  <div
                    className="publish-checklist-row"
                    onClick={() => setActiveStep("basics")}
                  >
                    <div className="publish-checklist-left">
                      <CheckCircle
                        size={20}
                        weight="fill"
                        className={isBasicsValid ? "is-valid" : "is-invalid"}
                      />
                      <strong>Basics</strong>
                    </div>
                    <div className="publish-checklist-right">
                      <span>{isBasicsValid ? "Completed" : "Incomplete"}</span>
                      <CaretRight size={16} />
                    </div>
                  </div>

                  {/* Checklist Item: Curriculum */}
                  <div
                    className="publish-checklist-row"
                    onClick={() => setActiveStep("curriculum")}
                  >
                    <div className="publish-checklist-left">
                      <CheckCircle
                        size={20}
                        weight="fill"
                        className={
                          isCurriculumValid ? "is-valid" : "is-invalid"
                        }
                      />
                      <strong>Curriculum</strong>
                    </div>
                    <div className="publish-checklist-right">
                      <span>
                        {totalSections} Sections, {totalLessons} Lessons
                      </span>
                      <CaretRight size={16} />
                    </div>
                  </div>

                  {/* Checklist Item: Access Rules */}
                  <div
                    className="publish-checklist-row"
                    onClick={() => setActiveStep("access-rules")}
                  >
                    <div className="publish-checklist-left">
                      <CheckCircle
                        size={20}
                        weight="fill"
                        className={
                          isAccessRulesValid ? "is-valid" : "is-invalid"
                        }
                      />
                      <strong>Access Rules</strong>
                    </div>
                    <div className="publish-checklist-right">
                      <span>
                        {accessRules.accessType === "everyone"
                          ? "Everyone"
                          : "Restricted Access"}
                      </span>
                      <CaretRight size={16} />
                    </div>
                  </div>

                  {/* Checklist Item: Pricing */}
                  <div
                    className="publish-checklist-row"
                    onClick={() => setActiveStep("pricing")}
                  >
                    <div className="publish-checklist-left">
                      <CheckCircle
                        size={20}
                        weight="fill"
                        className={isPricingValid ? "is-valid" : "is-invalid"}
                      />
                      <strong>Pricing</strong>
                    </div>
                    <div className="publish-checklist-right">
                      <span>
                        {pricing.pricingType === "free"
                          ? "Free"
                          : `₹${pricing.sellingPrice}`}
                      </span>
                      <CaretRight size={16} />
                    </div>
                  </div>

                  {/* Checklist Item: Extras */}
                  <div
                    className="publish-checklist-row"
                    onClick={() => setActiveStep("extras")}
                  >
                    <div className="publish-checklist-left">
                      <CheckCircle
                        size={20}
                        weight="fill"
                        className={isExtrasValid ? "is-valid" : "is-invalid"}
                      />
                      <strong>Extras</strong>
                    </div>
                    <div className="publish-checklist-right">
                      <span>
                        {extras.enableCertificate
                          ? "Certificate Enabled"
                          : "Disabled"}
                      </span>
                      <CaretRight size={16} />
                    </div>
                  </div>
                </div>

                {/* Ready-to-publish State Box */}
                {isCourseReadyToPublish ? (
                  <div className="publish-ready-box">
                    <div className="publish-ready-icon">
                      <BookOpen size={24} weight="fill" />
                    </div>
                    <div>
                      <strong>Your course is ready to be published!</strong>
                      <p>
                        Once published, students can see and enroll in this
                        course according to your settings.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="publish-unready-box">
                    <div className="publish-unready-icon">
                      <Info size={24} weight="bold" />
                    </div>
                    <div>
                      <strong>Course needs attention</strong>
                      <p>
                        Please fix incomplete sections highlighted above before
                        publishing.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Card 3: What happens after publishing? */}
            <div className="publish-after-card">
              <h3>3. What happens after publishing?</h3>

              <div className="publish-after-grid">
                {/* Feature 1: Visible to students */}
                <div className="publish-after-item">
                  <div className="publish-after-icon">
                    <Eye size={22} weight="bold" />
                  </div>
                  <div>
                    <strong>Visible to students</strong>
                    <p>
                      Students will be able to discover your course on the
                      platform.
                    </p>
                  </div>
                </div>

                {/* Feature 2: Enrollment starts */}
                <div className="publish-after-item">
                  <div className="publish-after-icon publish-after-icon--purple">
                    <UserPlus size={22} weight="bold" />
                  </div>
                  <div>
                    <strong>Enrollment starts</strong>
                    <p>
                      Students who meet the access rules can enroll in your
                      course.
                    </p>
                  </div>
                </div>

                {/* Feature 3: Track performance */}
                <div className="publish-after-item">
                  <div className="publish-after-icon publish-after-icon--blue">
                    <PlayCircle size={22} weight="fill" />
                  </div>
                  <div>
                    <strong>Track performance</strong>
                    <p>
                      Monitor enrollments, progress, and engagement in
                      real-time.
                    </p>
                  </div>
                </div>

                {/* Feature 4: Earn with every sale */}
                <div className="publish-after-item">
                  <div className="publish-after-icon publish-after-icon--pink">
                    <ChartBar size={22} weight="bold" />
                  </div>
                  <div>
                    <strong>Earn with every sale</strong>
                    <p>Get paid for every successful enrollment.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="course-wizard-body">
            <section className="course-wizard-card">
              <div className="course-wizard-card__header">
                <h2>{WIZARD_STEPS.find((s) => s.id === activeStep)?.label}</h2>
                <p>This section will allow configuring course {activeStep}.</p>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Persistent Shared Action Bar */}
      <footer className="course-wizard-footer">
        {publishValidationError && activeStep === "publish" && (
          <div className="publish-footer-error-banner">
            <Info size={16} weight="bold" />
            <span>{publishValidationError}</span>
          </div>
        )}
        <div className="course-wizard-footer__actions">
          <button type="button" className="course-wizard-btn-ghost">
            <Eye size={16} /> Preview
          </button>
          <button type="button" className="course-wizard-btn-draft">
            <FloppyDisk size={16} /> Save Draft
          </button>
          <button
            type="button"
            className="course-wizard-btn-primary"
            onClick={
              activeStep === "publish" ? handleFinalPublishCourse : undefined
            }
          >
            {activeStep === "publish"
              ? isPublished
                ? "Update Course"
                : "Publish Course"
              : "Save Changes"}
          </button>
        </div>
      </footer>
      {/* Reusable Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={deleteModalState.isOpen}
        title={deleteModalState.title}
        message={deleteModalState.message}
        onConfirm={deleteModalState.onConfirm}
        onClose={() =>
          setDeleteModalState((prev) => ({ ...prev, isOpen: false }))
        }
      />
    </div>
  );
}
