package com.jpromi.inventorycore.service;

import java.util.concurrent.TimeUnit;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Component;
import com.jpromi.inventorycore.entity.NotificationSettings;
import com.jpromi.inventorycore.entity.NotificationSubscription;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;

/** External I/O kept separate from retry and permission decisions. */
@Component
public class NotificationTransport {
    public void sendMail(NotificationSettings s, String address, String title, String body) {
        var sender = new JavaMailSenderImpl();
        sender.setDefaultEncoding(java.nio.charset.StandardCharsets.UTF_8.name());
        sender.setHost(s.getHost());
        sender.setPort(s.getPort());
        sender.setUsername(s.getUsername());
        sender.setPassword(s.getPassword());
        var props = sender.getJavaMailProperties();
        props.setProperty("mail.smtp.auth", Boolean.toString(s.getUsername() != null && !s.getUsername().isBlank()));
        props.setProperty("mail.smtp.starttls.enable", Boolean.toString(s.isStartTls()));
        props.setProperty("mail.smtp.starttls.required", Boolean.toString(s.isStartTls()));
        props.setProperty("mail.smtp.ssl.enable", Boolean.toString(s.getPort() == 465));
        props.setProperty("mail.smtp.ssl.checkserveridentity", "true");
        props.setProperty("mail.smtp.connectiontimeout", "10000");
        props.setProperty("mail.smtp.timeout", "10000");
        props.setProperty("mail.smtp.writetimeout", "10000");
        var mail = new SimpleMailMessage();
        mail.setFrom(s.getFromAddress());
        mail.setTo(address);
        mail.setSubject(title);
        mail.setText(body);
        sender.send(mail);
    }

    public int sendPush(NotificationSettings s, NotificationSubscription subscription) throws Exception {
        String subject = NotificationService.mailAvailable(s) ? "mailto:" + s.getFromAddress()
            : "https://github.com/JPromi/inventorycore";
        var push = new PushService(s.getVapidPublicKey(), s.getVapidPrivateKey(), subject);
        // No sensitive inventory details on lock screens or shared devices.
        var notification = new Notification(subscription.getEndpoint(), subscription.getP256dh(),
            subscription.getAuth(), "{\"notification\":{\"title\":\"InventoryCore\",\"body\":\"Neue Prüfungserinnerung im Posteingang.\",\"data\":{\"onActionClick\":{\"default\":{\"operation\":\"navigateLastFocusedOrOpen\",\"url\":\"/notifications\"}}}}}");
        var response = push.sendAsync(notification).get(15, TimeUnit.SECONDS);
        return response.getStatusLine().getStatusCode();
    }
}
