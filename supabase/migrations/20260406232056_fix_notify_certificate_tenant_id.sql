-- Fix: notify_certificate_issued trigger was missing tenant_id when inserting into notifications
-- This caused "null value in column tenant_id" error when certificates were auto-issued

CREATE OR REPLACE FUNCTION public.notify_certificate_issued()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    v_profile RECORD;
    v_course RECORD;
    v_notification_id BIGINT;
BEGIN
    -- Get student profile
    SELECT full_name INTO v_profile FROM public.profiles WHERE id = NEW.user_id;
    -- Get course title
    SELECT title INTO v_course FROM public.courses WHERE course_id = NEW.course_id;

    -- Create notification record (include tenant_id from the certificate)
    INSERT INTO public.notifications (
        title,
        content,
        notification_type,
        priority,
        target_type,
        target_user_ids,
        target_course_id,
        status,
        tenant_id,
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
        NEW.tenant_id,
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
$func$;
