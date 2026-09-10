import { ApiService } from "@/services/api/apiService";

export type ProfilePayload = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  timezone?: string;
  skype?: string;
  email?: string;
  avatars?: any[];
  // Idioma elegido (es|en|pt). Persistirlo en el backend es lo que hace que los
  // correos y notificaciones lleguen en el idioma del usuario — no basta con
  // localStorage. Ver LanguageContext + backend resolveRecipientLanguage.
  language?: string;
};

export type ChangeEmailPayload = {
  password: string;
  newEmail: string;
};

const AccountService = {
  async getMe() {
    return ApiService.get("/auth/me");
  },

  async updateProfile(payload: ProfilePayload) {
    return ApiService.put("/auth/profile", { data: payload });
  },

  async changePassword(oldPassword: string, newPassword: string) {
    return ApiService.put("/auth/change-password", {
      oldPassword,
      newPassword,
    });
  },

  async sendVerifyEmail(email: string, tenantId?: string) {
    return ApiService.post("/auth/send-email-address-verification-email", {
      email,
      tenantId,
    });
  },

  async changeEmail(payload: ChangeEmailPayload) {
    return ApiService.post("/auth/change-email", payload);
  },

  async sendPhoneVerificationCode(phoneNumber: string) {
    return ApiService.post("/auth/send-phone-verification", { phoneNumber });
  },

  async verifyPhone(code: string, phoneNumber: string) {
    return ApiService.post("/auth/verify-phone", { code, phoneNumber });
  },

  async uploadAvatar(file: File, tenantId: string, userId: string) {
    const filename = file.name;
    const creds: any = await ApiService.get(
      `/tenant/${tenantId}/file/credentials?filename=${encodeURIComponent(
        filename,
      )}&storageId=userAvatarsProfiles`,
    );

    const uploadUrl = creds.uploadCredentials?.url;

    if (!uploadUrl) throw new Error("Upload URL not available");

    const form = new FormData();

    form.append("filename", filename);
    form.append("file", file);

    const uploadResp = await fetch(uploadUrl, {
      method: "POST",
      body: form,
    });

    if (!uploadResp.ok) {
      const text = await uploadResp.text().catch(() => null);

      throw new Error(`Upload failed: ${uploadResp.status} ${text}`);
    }

    const fileObj = {
      new: true,
      name: filename,
      sizeInBytes: file.size,
      privateUrl: creds.privateUrl,
      publicUrl: creds.uploadCredentials?.publicUrl ?? null,
    };

    return ApiService.put("/auth/profile", { data: { avatars: [fileObj] } });
  },
};

export default AccountService;
