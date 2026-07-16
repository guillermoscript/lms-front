"use client"

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { IconMessageCircle, IconNotebook } from "@tabler/icons-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

interface ExerciseWorkspaceProps {
  task: ReactNode
  aiChat: ReactNode
  supportingContent?: ReactNode
}

export function ExerciseWorkspace({
  task,
  aiChat,
  supportingContent,
}: ExerciseWorkspaceProps) {
  const t = useTranslations("exercises.workspace")
  const [activePanel, setActivePanel] = useState<"task" | "chat">("task")
  const taskPanelId = useId()
  const chatPanelId = useId()
  const taskTabRef = useRef<HTMLButtonElement>(null)
  const chatTabRef = useRef<HTMLButtonElement>(null)

  const selectPanel = (panel: "task" | "chat", focus = false) => {
    setActivePanel(panel)
    if (focus) {
      requestAnimationFrame(() =>
        (panel === "task" ? taskTabRef : chatTabRef).current?.focus()
      )
    }
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault()
      selectPanel("chat", true)
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault()
      selectPanel("task", true)
    }
    if (event.key === "Home") {
      event.preventDefault()
      selectPanel("task", true)
    }
    if (event.key === "End") {
      event.preventDefault()
      selectPanel("chat", true)
    }
  }

  return (
    <div className="space-y-6">
      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
        <div
          className="mb-4 grid grid-cols-2 rounded-xl border bg-muted/40 p-1 lg:hidden"
          role="tablist"
          aria-label={t("label")}
        >
          <button
            ref={taskTabRef}
            id={`${taskPanelId}-tab`}
            type="button"
            role="tab"
            aria-selected={activePanel === "task"}
            aria-controls={taskPanelId}
            tabIndex={activePanel === "task" ? 0 : -1}
            onClick={() => selectPanel("task")}
            onKeyDown={handleTabKeyDown}
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activePanel === "task"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <IconNotebook className="h-4 w-4" aria-hidden="true" />
            {t("task")}
          </button>
          <button
            ref={chatTabRef}
            id={`${chatPanelId}-tab`}
            type="button"
            role="tab"
            aria-selected={activePanel === "chat"}
            aria-controls={chatPanelId}
            tabIndex={activePanel === "chat" ? 0 : -1}
            onClick={() => selectPanel("chat")}
            onKeyDown={handleTabKeyDown}
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activePanel === "chat"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <IconMessageCircle className="h-4 w-4" aria-hidden="true" />
            {t("aiChat")}
          </button>
        </div>

        <section
          id={taskPanelId}
          role="tabpanel"
          aria-labelledby={`${taskPanelId}-tab`}
          className={cn(
            activePanel === "task" ? "block" : "hidden",
            "lg:col-span-7 lg:block"
          )}
        >
          {task}
        </section>

        <section
          id={chatPanelId}
          role="tabpanel"
          aria-labelledby={`${chatPanelId}-tab`}
          className={cn(
            activePanel === "chat" ? "block" : "hidden",
            "lg:col-span-5 lg:block"
          )}
        >
          <div className="lg:sticky lg:top-6">{aiChat}</div>
        </section>
      </div>

      {supportingContent && <div>{supportingContent}</div>}
    </div>
  )
}
