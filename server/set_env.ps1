# Set all Vercel environment variables for the server project (no trailing newlines)

$envVars = @{
  "SUPABASE_URL"              = "https://vcjvdqhgvdlrzmnymkpf.supabase.co"
  "SUPABASE_SERVICE_ROLE_KEY" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjanZkcWhndmRscnptbnlta3BmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE3NDUzNywiZXhwIjoyMDkxNzUwNTM3fQ.RRCQ0wo30-R-kxQlTXK7UIJUf6WR5ZZmsOD4qiGrHYU"
  "SUPABASE_ANON_KEY"         = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjanZkcWhndmRscnptbnlta3BmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzQ1MzcsImV4cCI6MjA5MTc1MDUzN30.bsoyEZm2-5rIf9tanvJTyOErb3lu_mTogAuFVspvkjw"
  "OPENROUTER_API_KEY"        = "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"
  "SARVAM_API_KEY"            = "sk_p0lm1wmg_4oaHETa97BxwAvRo8KNY1BOY"
  "NODE_ENV"                  = "production"
  "FRONTEND_URL"              = "https://client-xi-blond-54.vercel.app"
}

foreach ($key in $envVars.Keys) {
  $val = $envVars[$key]
  # Write value to a temp file without trailing newline
  $tmpFile = [System.IO.Path]::GetTempFileName()
  [System.IO.File]::WriteAllText($tmpFile, $val)
  # Use Get-Content to pipe without trailing newline
  Get-Content $tmpFile -Raw | npx vercel env add $key production
  Remove-Item $tmpFile
  Write-Host "Set $key"
}
