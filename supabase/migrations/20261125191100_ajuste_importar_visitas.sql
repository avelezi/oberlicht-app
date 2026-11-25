-- Importar visitas: reconoce el área por nombre (natación, gimnasio, alberca…) además del código
create or replace function public.importar_visitas(p_rows jsonb, p_file text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_batch uuid; v_member uuid; v_in timestamptz; v_out timestamptz; v_area text;
  n_ok int := 0; n_dup int := 0; n_err int := 0; v_errors jsonb := '[]'; v_i int := 0; v_cnt int;
begin
  if not public.is_front_office() then raise exception 'Solo recepción, administración o dirección pueden importar'; end if;
  insert into public.import_batches (kind, file_name, rows_total) values ('visitas', p_file, jsonb_array_length(p_rows)) returning id into v_batch;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1; v_member := null;
    begin
      v_in := public.imp_momento(r->>'entrada');
      v_out := public.imp_momento(r->>'salida');
      if v_in is null then raise exception 'Sin fecha y hora de entrada'; end if;
      if v_out is not null and v_out < v_in then v_out := null; end if;

      if coalesce(r->>'ref', '') <> '' then
        select id into v_member from public.members where external_id = r->>'ref';
      end if;
      if v_member is null and coalesce(r->>'numero_familia', '') <> '' and coalesce(r->>'nombre', '') <> '' then
        select m.id into v_member from public.members m join public.families f on f.id = m.family_id
         where (f.number::text = r->>'numero_familia' or f.external_id = r->>'numero_familia')
           and lower(m.first_name || ' ' || m.last_name) like '%' || lower(trim(r->>'nombre')) || '%'
         limit 1;
      end if;
      if v_member is null and coalesce(r->>'nombre', '') <> '' then
        select count(*), min(m.id::text)::uuid into v_cnt, v_member from public.members m
         where lower(trim(m.first_name || ' ' || m.last_name)) = lower(trim(r->>'nombre'));
        if v_cnt <> 1 then v_member := null; end if;
      end if;
      if v_member is null then raise exception 'No encontramos al socio'; end if;

      v_area := nullif(lower(translate(btrim(coalesce(r->>'area', '')), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')), '');
      if v_area is not null then
        v_area := case when v_area ~ '(gym|gimnasio|fit|pesas)' then 'oberfit' when v_area ~ '(alberca|nata|pool|swim)' then 'natacion' else v_area end;
        select code into v_area from public.departments
         where code = v_area or lower(translate(name, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) like v_area || '%' order by (code = v_area) desc limit 1;
      end if;

      insert into public.visits (member_id, department, check_in_at, check_out_at, source, import_batch, recorded_by)
      values (v_member, v_area, v_in, v_out, 'importado', v_batch, auth.uid())
      on conflict (member_id, check_in_at) do nothing;
      if found then n_ok := n_ok + 1; else n_dup := n_dup + 1; end if;
    exception when others then
      n_err := n_err + 1;
      if jsonb_array_length(v_errors) < 200 then
        v_errors := v_errors || jsonb_build_object('fila', v_i, 'dato', coalesce(r->>'nombre', r->>'ref', ''), 'motivo', sqlerrm);
      end if;
    end;
  end loop;

  update public.import_batches set rows_ok = n_ok, rows_skipped = n_dup, rows_error = n_err, errors = v_errors where id = v_batch;
  return jsonb_build_object('lote', v_batch, 'importados', n_ok, 'repetidos', n_dup, 'con_error', n_err, 'errores', v_errors);
end $$;
