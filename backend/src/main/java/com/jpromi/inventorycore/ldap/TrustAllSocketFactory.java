package com.jpromi.inventorycore.ldap;

import java.io.IOException;
import java.net.InetAddress;
import java.net.Socket;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;

import javax.net.SocketFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLEngine;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509ExtendedTrustManager;

/**
 * Socket factory for ldaps:// that accepts every certificate and host name.
 * JNDI instantiates it by class name through the static {@link #getDefault()}.
 *
 * <p>An {@link X509ExtendedTrustManager} is used on purpose: with a plain X509TrustManager
 * the JDK would still check the host name.
 */
public class TrustAllSocketFactory extends SSLSocketFactory {

    private static final SSLSocketFactory DELEGATE = createDelegate();

    public static SocketFactory getDefault() {
        return new TrustAllSocketFactory();
    }

    private static SSLSocketFactory createDelegate() {
        try {
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, new TrustManager[] { new TrustAllManager() }, new SecureRandom());
            return context.getSocketFactory();
        } catch (Exception exception) {
            throw new IllegalStateException("Could not create trust-all SSL context", exception);
        }
    }

    @Override
    public String[] getDefaultCipherSuites() {
        return DELEGATE.getDefaultCipherSuites();
    }

    @Override
    public String[] getSupportedCipherSuites() {
        return DELEGATE.getSupportedCipherSuites();
    }

    @Override
    public Socket createSocket() throws IOException {
        return DELEGATE.createSocket();
    }

    @Override
    public Socket createSocket(Socket socket, String host, int port, boolean autoClose) throws IOException {
        return DELEGATE.createSocket(socket, host, port, autoClose);
    }

    @Override
    public Socket createSocket(String host, int port) throws IOException {
        return DELEGATE.createSocket(host, port);
    }

    @Override
    public Socket createSocket(String host, int port, InetAddress localHost, int localPort) throws IOException {
        return DELEGATE.createSocket(host, port, localHost, localPort);
    }

    @Override
    public Socket createSocket(InetAddress host, int port) throws IOException {
        return DELEGATE.createSocket(host, port);
    }

    @Override
    public Socket createSocket(InetAddress address, int port, InetAddress localAddress, int localPort) throws IOException {
        return DELEGATE.createSocket(address, port, localAddress, localPort);
    }

    private static final class TrustAllManager extends X509ExtendedTrustManager {
        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) {
        }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) {
        }

        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType, Socket socket) {
        }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType, Socket socket) {
        }

        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType, SSLEngine engine) {
        }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType, SSLEngine engine) {
        }

        @Override
        public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
        }
    }
}
