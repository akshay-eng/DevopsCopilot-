install grafana 

kafka-topics.sh --version
ubuntu@ubuntu:~/Devops-Copilot-Assets/kafka_2.13-4.1.0$ nano ~/.bashrc

# Add Kafka bin directory to PATH for global access
export KAFKA_HOME=~/Devops-Copilot-Assets/kafka_2.13-4.1.0
export PATH=$PATH:$KAFKA_HOME/bin

ubuntu@ubuntu:~/Devops-Copilot-Assets/kafka_2.13-4.1.0$ source ~/.bashrc
ubuntu@ubuntu:~/Devops-Copilot-Assets/kafka_2.13-4.1.0$ kafka-topics.sh --version
4.1.0
ubuntu@ubuntu:~/Devops-Copilot-Assets/kafka_2.13-4.1.0$ kafka-topics.sh --create   --bootstrap-server localhost:9092   --topic grafana-alerts   --partitions 3   --replication-factor 1
Created topic grafana-alerts.
