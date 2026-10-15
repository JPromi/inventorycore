package com.jpromi.inventorycore.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.jpromi.inventorycore.entity.Tag;

public interface TagRepository extends JpaRepository<Tag, Long> {
    Optional<Tag> findByUuid(UUID uuid);

    /** Removes the tag from all assets, so it can be deleted although it is in use. */
    @Modifying
    @Query(value = "delete from asset_tags where tag_id = :tagId", nativeQuery = true)
    void detachFromAssets(@Param("tagId") Long tagId);

    @Modifying
    @Query(value = "delete from asset_type_tags where tag_id = :tagId", nativeQuery = true)
    void detachFromAssetTypes(@Param("tagId") Long tagId);

    @Modifying
    @Query(value = "delete from inspection_type_default_tags where tag_id = :tagId", nativeQuery = true)
    void detachFromInspectionTypes(@Param("tagId") Long tagId);

    @Modifying
    @Query(value = "delete from inspection_type_recurring_tags where tag_id = :tagId", nativeQuery = true)
    void detachFromRecurringInspections(@Param("tagId") Long tagId);

    /** Names of recurring inspections limited to this tag alone (removing it would make them apply to all assets). */
    @Query(value = """
        select t.name from inspection_types t
        where exists (select 1 from inspection_type_recurring_tags r where r.inspection_type_id = t.id and r.tag_id = :tagId)
          and (select count(*) from inspection_type_recurring_tags r where r.inspection_type_id = t.id) = 1
        """, nativeQuery = true)
    java.util.List<String> recurringInspectionsOnlyWith(@Param("tagId") Long tagId);
}
