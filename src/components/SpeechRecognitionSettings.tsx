import { useMemo } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type LanguageOption = {
  value: string;
  label: string;
};

const COMMON_LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "fr-CA", label: "French (Canada)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "es-MX", label: "Spanish (Mexico)" },
  { value: "ja-JP", label: "Japanese" },
  { value: "ko-KR", label: "Korean" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "zh-TW", label: "Chinese (Traditional)" },
];

interface SpeechRecognitionSettingsProps {
  language: string;
  onLanguageChange: (language: string) => void;
}

export function SpeechRecognitionSettings({
  language,
  onLanguageChange,
}: SpeechRecognitionSettingsProps) {
  const languageOptions = useMemo(() => {
    const options = [...COMMON_LANGUAGE_OPTIONS];
    if (language && !options.find((option) => option.value === language)) {
      options.unshift({ value: language, label: language });
    }
    return options;
  }, [language]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Transcription Language</CardTitle>
        <CardDescription>
          Language hint sent to server transcription for better accuracy.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="transcription-language">Language</Label>
          <Select value={language} onValueChange={onLanguageChange}>
            <SelectTrigger id="transcription-language">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {languageOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
