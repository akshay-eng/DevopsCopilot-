import sys
import paramiko

HOST = "172.17.204.5"
USER = "ubuntu"
PASS = "Wipro@123"

cmd = sys.argv[1] if len(sys.argv) > 1 else "echo no-command-given"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=15)

stdin, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=120)
exit_status = stdout.channel.recv_exit_status()
out = stdout.read().decode(errors="replace")
err = stderr.read().decode(errors="replace")

print(out)
if err:
    print("STDERR:", err, file=sys.stderr)
print(f"EXIT_STATUS={exit_status}")

client.close()
