# Run this script as Administrator on Windows
$wsl_ip = "172.20.72.118"

Write-Host "Configuring generic port proxy for WSL..."
Write-Host "Target IP: $wsl_ip"

# Forward Vite Server (5173)
netsh interface portproxy add v4tov4 listenport=5173 listenaddress=0.0.0.0 connectport=5173 connectaddress=$wsl_ip
Write-Host "Forwarded Port 5173 (Frontend)"

# Forward Storage Server (3001)
netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=$wsl_ip
Write-Host "Forwarded Port 3001 (Backend)"

# Allow through firewall (if needed)
# Remove existing rule first to avoid duplicates
Remove-NetFirewallRule -DisplayName "DayPlanner Web" -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "DayPlanner Web" -Direction Inbound -LocalPort 5173,3001 -Protocol TCP -Action Allow
Write-Host "Configured Firewall Rules"

Write-Host "Done! You should now be able to access:"
Write-Host "  http://localhost:5173"
Write-Host "  http://<Your-LAN-IP>:5173"
