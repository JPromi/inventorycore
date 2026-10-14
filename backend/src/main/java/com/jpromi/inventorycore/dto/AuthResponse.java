package com.jpromi.inventorycore.dto;

import java.util.Set;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {

    @Builder.Default
    private boolean authenticated = false;

    private String username;
    
    private String displayName;

    private String role;

    @Builder.Default
    private Set<GroupPermissionResponse> permissions = Set.of();

    private String message;
}
