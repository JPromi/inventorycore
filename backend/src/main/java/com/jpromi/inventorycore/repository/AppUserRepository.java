package com.jpromi.inventorycore.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.jpromi.inventorycore.entity.User;

public interface AppUserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);
    boolean existsByUsername(String username);
}
