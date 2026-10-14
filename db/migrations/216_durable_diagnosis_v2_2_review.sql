-- SKSK #216 durable diagnosis v2.2 REVIEW DRAFT.
-- Apply ONLY to the isolated test project after review. Never production.
-- The caller must be a trusted service-role backend; p_shop is not itself authentication.
BEGIN;
CREATE OR REPLACE FUNCTION public.claim_diagnosis_operation(
 p_shop text,p_key text,p_version integer,p_fingerprint text,p_job_id text,p_initial_job jsonb)
RETURNS TABLE(disposition text,operation_id uuid,generation bigint,linked_job_id text,stored_fingerprint_version integer,lease_deadline timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public
AS $fn$
DECLARE op public.diagnosis_operations%ROWTYPE; inserted_id uuid; stamped jsonb;
BEGIN
 IF p_shop IS NULL OR btrim(p_shop)='' OR p_key IS NULL OR length(p_key) NOT BETWEEN 16 AND 200
 OR p_version IS NULL OR p_version<1 OR p_fingerprint IS NULL OR length(p_fingerprint)<>64
 OR p_job_id IS NULL OR btrim(p_job_id)='' OR p_initial_job IS NULL
 OR jsonb_typeof(p_initial_job)<>'object' THEN
  RAISE EXCEPTION 'invalid diagnosis claim' USING ERRCODE='22023';
 END IF;
 IF (p_initial_job ? 'shopId' AND p_initial_job->>'shopId' IS DISTINCT FROM p_shop)
 OR (p_initial_job ? 'jobId' AND p_initial_job->>'jobId' IS DISTINCT FROM p_job_id) THEN
  RAISE EXCEPTION 'diagnosis claim ownership mismatch' USING ERRCODE='22023';
 END IF;
 stamped := jsonb_set(jsonb_set(p_initial_job,'{shopId}',to_jsonb(p_shop),true),'{jobId}',to_jsonb(p_job_id),true);
 INSERT INTO public.diagnosis_operations(shop_id,idempotency_key,fingerprint_version,request_fingerprint,job_id)
 VALUES(p_shop,p_key,p_version,p_fingerprint,p_job_id)
 ON CONFLICT (shop_id,operation_type,idempotency_key) DO NOTHING RETURNING id INTO inserted_id;
 SELECT * INTO STRICT op FROM public.diagnosis_operations AS o
 WHERE o.shop_id=p_shop AND o.operation_type='diagnose' AND o.idempotency_key=p_key FOR UPDATE;
 IF op.fingerprint_version<>p_version THEN
  RETURN QUERY SELECT 'VERSION_RECHECK'::text,op.id,op.generation,op.job_id,op.fingerprint_version,op.lease_expires_at; RETURN;
 END IF;
 IF op.request_fingerprint<>p_fingerprint THEN
  RETURN QUERY SELECT 'CONFLICT'::text,op.id,op.generation,op.job_id,op.fingerprint_version,op.lease_expires_at; RETURN;
 END IF;
 IF inserted_id IS NOT NULL THEN
  INSERT INTO public.service_jobs(job_id,status,payload,operation_id,diagnosis_execution_state,updated_at)
  VALUES(op.job_id,'DIAGNOSING',stamped,op.id,'PROCESSING',now())
  ON CONFLICT (job_id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.service_jobs AS j WHERE j.operation_id=op.id AND j.job_id=op.job_id AND j.payload->>'shopId'=p_shop) THEN
   RAISE EXCEPTION 'claim job association mismatch' USING ERRCODE='23505';
  END IF;
  RETURN QUERY SELECT 'CLAIMED'::text,op.id,op.generation,op.job_id,op.fingerprint_version,op.lease_expires_at; RETURN;
 END IF;
 RETURN QUERY SELECT op.status::text,op.id,op.generation,op.job_id,op.fingerprint_version,op.lease_expires_at;
END $fn$;
CREATE OR REPLACE FUNCTION public.finish_diagnosis_operation(
 p_shop text,p_operation uuid,p_generation bigint,p_terminal text,p_job_status text,p_job_payload jsonb,p_http_status integer,p_response_bytes bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public
AS $fn$
DECLARE op public.diagnosis_operations%ROWTYPE; stamped jsonb;
BEGIN
 IF p_shop IS NULL OR btrim(p_shop)='' OR p_operation IS NULL OR p_generation IS NULL
 OR p_terminal IS NULL OR p_terminal NOT IN ('COMPLETED','FAILED')
 OR p_response_bytes IS NULL OR p_http_status IS NULL OR p_http_status NOT BETWEEN 100 AND 599
 OR p_job_payload IS NULL OR jsonb_typeof(p_job_payload)<>'object'
 OR (p_terminal='COMPLETED' AND p_job_status IS DISTINCT FROM 'TESTING')
 OR (p_terminal='FAILED' AND p_job_status IS DISTINCT FROM 'DIAG_FAILED') THEN
  RAISE EXCEPTION 'invalid terminal completion' USING ERRCODE='22023';
 END IF;
 SELECT * INTO op FROM public.diagnosis_operations AS o
 WHERE o.id=p_operation AND o.shop_id=p_shop FOR UPDATE;
 IF NOT FOUND OR op.generation<>p_generation OR op.status NOT IN ('PROCESSING','UNRESOLVED') THEN RETURN false; END IF;
 IF (p_job_payload ? 'shopId' AND p_job_payload->>'shopId' IS DISTINCT FROM op.shop_id)
 OR (p_job_payload ? 'jobId' AND p_job_payload->>'jobId' IS DISTINCT FROM op.job_id) THEN
  RAISE EXCEPTION 'diagnosis finish ownership mismatch' USING ERRCODE='22023';
 END IF;
 stamped := jsonb_set(jsonb_set(p_job_payload,'{shopId}',to_jsonb(op.shop_id),true),'{jobId}',to_jsonb(op.job_id),true);
 UPDATE public.service_jobs AS j SET status=p_job_status,payload=stamped,
 diagnosis_execution_state=CASE WHEN p_terminal='COMPLETED' THEN 'COMPLETED' ELSE 'FAILED' END,
 diagnosis_completed_at=now(),updated_at=now()
 WHERE j.operation_id=op.id AND j.job_id=op.job_id AND j.diagnosis_execution_state='PROCESSING'
 AND j.payload->>'shopId'=op.shop_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'fenced job write rejected' USING ERRCODE='40001'; END IF;
 UPDATE public.diagnosis_operations AS o SET status=p_terminal,response_status=p_http_status,
 response_body_bytes=p_response_bytes,response_content_type='application/json',completed_at=now(),updated_at=now()
 WHERE o.id=op.id AND o.shop_id=p_shop AND o.generation=p_generation
 AND o.status IN ('PROCESSING','UNRESOLVED');
 IF NOT FOUND THEN RAISE EXCEPTION 'fenced operation write rejected' USING ERRCODE='40001'; END IF;
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.claim_diagnosis_operation(text,text,integer,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_diagnosis_operation(text,uuid,bigint,text,text,jsonb,integer,bytea) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_diagnosis_operation(text,text,integer,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_diagnosis_operation(text,uuid,bigint,text,text,jsonb,integer,bytea) TO service_role;
COMMIT;
