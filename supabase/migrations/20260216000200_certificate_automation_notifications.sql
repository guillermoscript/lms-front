-- Add certificate issuance notification template
INSERT INTO public.notification_templates (name, title, content, category, variables)
VALUES (
    'certificate_issued', 
    'Congratulations! You''ve earned a certificate', 
    'Hi {{student_name}},\n\nYou have successfully completed "{{course_title}}" and earned your official certificate!\n\nYou can view and download it from your profile.\n\nWell done!', 
    'course', 
    '["student_name", "course_title"]'
) ON CONFLICT DO NOTHING;

-- Function to handle certificate issuance notifications
CREATE OR REPLACE FUNCTION public.notify_certificate_issued()
RETURNS TRIGGER AS $$
DECLARE
    v_profile RECORD;
    v_course RECORD;
    v_notification_id BIGINT;
BEGIN
    -- Get student profile
    SELECT full_name INTO v_profile FROM public.profiles WHERE id = NEW.user_id;
    -- Get course title
    SELECT title INTO v_course FROM public.courses WHERE course_id = NEW.course_id;

    -- Create notification record
    INSERT INTO public.notifications (
        title,
        content,
        notification_type,
        priority,
        target_type,
        target_user_ids,
        target_course_id,
        status,
        metadata
    ) VALUES (
        'Certificate Earned: ' || v_course.title,
        'Congratulations ' || v_profile.full_name || '! You have earned your certificate for ' || v_course.title || '.',
        'certificate_issued',
        'high',
        'user',
        ARRAY[NEW.user_id],
        NEW.course_id,
        'sent',
        jsonb_build_object(
            'certificate_id', NEW.certificate_id,
            'verification_code', NEW.verification_code,
            'action_link', '/dashboard/student/profile'
        )
    ) RETURNING id INTO v_notification_id;

    -- Create user notification link
    INSERT INTO public.user_notifications (notification_id, user_id)
    VALUES (v_notification_id, NEW.user_id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to notify when a certificate is inserted
DROP TRIGGER IF EXISTS trigger_notify_certificate_issued ON public.certificates;
CREATE TRIGGER trigger_notify_certificate_issued
    AFTER INSERT ON public.certificates
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_certificate_issued();

-- Automated issuance logic
CREATE OR REPLACE FUNCTION public.handle_automatic_issuance()
RETURNS TRIGGER AS $$
DECLARE
    v_eligible_result JSONB;
BEGIN
    -- Check if student is eligible for certificate
    -- NEW can be from lesson_completions or exam_attempts
    -- Both have user_id and we need course_id.
    
    -- This function will be called from specific triggers.
    -- For now, let's keep it simple and just define the logic.
    -- The actual check_and_issue_certificate function will be called.
    
    -- Note: check_and_issue_certificate currently only returns readiness.
    -- We might need a function that actually INSERTS the certificate.
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
