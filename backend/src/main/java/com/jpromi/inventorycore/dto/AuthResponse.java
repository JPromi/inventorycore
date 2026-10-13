package com.jpromi.inventorycore.dto;

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

    private String message;
}
