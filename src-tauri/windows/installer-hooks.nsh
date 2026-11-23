!define LEGACY_BNOTE_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\bbb-notepad"
Var MigratedLegacyBnote

!macro NSIS_HOOK_PREINSTALL
  Push $0
  Push $1
  ReadRegStr $0 HKCU "${LEGACY_BNOTE_UNINSTALL_KEY}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $1 $0 1
    ${If} $1 == '$\"'
      StrCpy $0 $0 -1 1
    ${EndIf}
    ; Use the old uninstaller to clean up its shortcuts and registration.
    ; Silent uninstall leaves app data alone unless deletion is requested.
    ClearErrors
    ExecWait '"$0\uninstall.exe" /S' $1
    ${If} ${Errors}
    ${OrIf} $1 != 0
      Abort "Could not remove the previous bbb-notepad installation."
    ${EndIf}
    StrCpy $MigratedLegacyBnote 1
    ; The old uninstaller can remove the directory when reusing that path.
    SetOutPath "$INSTDIR"
  ${EndIf}
  Pop $1
  Pop $0
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $MigratedLegacyBnote = 1
  ${AndIf} $UpdateMode = 1
    ; The default updater skips shortcut creation and looks for the new name.
    StrCpy $UpdateMode 0
    Call CreateOrUpdateStartMenuShortcut
    StrCpy $UpdateMode 1
  ${EndIf}
  CreateDirectory "$SMPROGRAMS"
  CreateShortcut "$SMPROGRAMS\bnote Sticky Note.lnk" "$INSTDIR\bnote.exe" "--sticky"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$SMPROGRAMS\bnote Sticky Note.lnk"
!macroend
