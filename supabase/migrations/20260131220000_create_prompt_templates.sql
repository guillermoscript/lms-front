-- Create prompt templates table for AI prompt management
CREATE TABLE prompt_templates (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL, -- 'lesson_task', 'exercise', 'exam_grading'
  description TEXT,
  task_description_template TEXT, -- Student-facing prompt with {{variables}}
  system_prompt_template TEXT, -- AI instructions with {{variables}}
  variables JSONB, -- { "variables": ["student_name", "topic"] }
  is_system BOOLEAN DEFAULT false, -- true for built-in templates
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public read for system templates" ON prompt_templates
  FOR SELECT USING (is_system = true);

CREATE POLICY "Teachers manage their own templates" ON prompt_templates
  FOR ALL USING (created_by = auth.uid());

-- Index for faster category filtering
CREATE INDEX idx_prompt_templates_category ON prompt_templates(category);
CREATE INDEX idx_prompt_templates_is_system ON prompt_templates(is_system);
