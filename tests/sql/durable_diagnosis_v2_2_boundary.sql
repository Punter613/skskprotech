-- v2.2 disposable-database integration assertions. Execute after migration.
-- Runs in a transaction and rolls back all test rows.
BEGIN;
DO $test$
DECLARE
 a text := 'v22a_'||substr(md5(random()::text),1,12);
 b text := 'v22b_'||substr(md5(random()::text),1,12);
 k text := 'v22-key-'||md5(random()::text);
 j text := 'v22-job-'||md5(random()::text);
 op uuid; g bigint; d text; ok boolean; n integer;
BEGIN
 BEGIN
  PERFORM public.claim_diagnosis_operation(a,k,1,repeat('a',64),j,jsonb_build_object('shopId',b));
  RAISE EXCEPTION 'forged claim accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 BEGIN
  PERFORM public.claim_diagnosis_operation(a,k,1,repeat('a',64),j,jsonb_build_object('jobId','wrong'));
  RAISE EXCEPTION 'forged job accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 SELECT c.disposition,c.operation_id,c.generation INTO d,op,g FROM public.claim_diagnosis_operation(a,k,1,repeat('a',64),j,'{}'::jsonb) c;
 IF d<>'CLAIMED' THEN RAISE EXCEPTION 'claim failed: %',d; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.service_jobs s WHERE s.job_id=j AND s.payload->>'shopId'=a AND s.payload->>'jobId'=j) THEN RAISE EXCEPTION 'stamp failed'; END IF;
 SELECT count(*) INTO n FROM public.read_diagnosis_operation(b,k) x WHERE x.disposition='NOT_FOUND';
 IF n<>1 THEN RAISE EXCEPTION 'cross shop read leaked'; END IF;
 SELECT count(*) INTO n FROM public.claim_diagnosis_operation(a,k,1,repeat('a',64),j,'{}'::jsonb) x WHERE x.disposition='PROCESSING';
 IF n<>1 THEN RAISE EXCEPTION 'retry failed'; END IF;
 ok:=public.finish_diagnosis_operation(b,op,g,'COMPLETED','TESTING','{}'::jsonb,200,convert_to('{}','UTF8'));
 IF ok THEN RAISE EXCEPTION 'cross shop finish accepted'; END IF;
 ok:=public.finish_diagnosis_operation(a,op,g+1,'COMPLETED','TESTING','{}'::jsonb,200,convert_to('{}','UTF8'));
 IF ok THEN RAISE EXCEPTION 'stale generation accepted'; END IF;
 BEGIN
  PERFORM public.finish_diagnosis_operation(a,op,g,'COMPLETED','TESTING',jsonb_build_object('shopId',b),200,convert_to('{}','UTF8'));
  RAISE EXCEPTION 'forged finish accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 ok:=public.finish_diagnosis_operation(a,op,g,'COMPLETED','TESTING','{}'::jsonb,200,convert_to('{"ok":true}','UTF8'));
 IF NOT ok THEN RAISE EXCEPTION 'valid finish failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.service_jobs s WHERE s.job_id=j AND s.payload->>'shopId'=a AND s.payload->>'jobId'=j AND s.status='TESTING') THEN RAISE EXCEPTION 'finish stamp failed'; END IF;
 SELECT count(*) INTO n FROM public.read_diagnosis_operation(a,k) x WHERE x.disposition='COMPLETED' AND x.http_status=200;
 IF n<>1 THEN RAISE EXCEPTION 'replay failed'; END IF;
 SELECT count(*) INTO n FROM public.read_diagnosis_operation(b,k) x WHERE x.disposition='NOT_FOUND';
 IF n<>1 THEN RAISE EXCEPTION 'replay leaked'; END IF;
 ok:=public.finish_diagnosis_operation(a,op,g,'COMPLETED','TESTING','{}'::jsonb,200,convert_to('{}','UTF8'));
 IF ok THEN RAISE EXCEPTION 'double finish accepted'; END IF;
 RAISE NOTICE 'PASS: 11 durable SQL assertions';
END $test$;
ROLLBACK;
