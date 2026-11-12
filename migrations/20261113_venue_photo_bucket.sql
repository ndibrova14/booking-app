-- Окреме сховище тільки для публічних фото закладів.
-- Пряме анонімне завантаження не дозволяється: застосунок видає тимчасовий дозвіл після перевірки адміністратора.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('poimo-venue-photos','poimo-venue-photos',true,2097152,array['image/jpeg'])
on conflict(id) do nothing;
