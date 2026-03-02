-- Make exam_date nullable so teachers can create exams without scheduling a date yet.
-- The MCP tool and UI both treat exam_date as optional (display "TBD" when null).
ALTER TABLE public.exams ALTER COLUMN exam_date DROP NOT NULL;
