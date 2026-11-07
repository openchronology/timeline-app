# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# services.openchronology (#461; docs/nix.md): the OpenChronology server on NixOS, doing what
# the Debian package's scripts do (deploy/debian-server): a system user, a local PostgreSQL
# database with pgmp, a generated AUTH_ENCRYPTION_KEY, the migration before each start, the
# server as a hardened systemd service, and optionally the mail worker, the log importers and
# an nginx virtual host in front of it.
self:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.openchronology;
  inherit (lib)
    mkEnableOption
    mkIf
    mkMerge
    mkOption
    mkPackageOption
    types
    ;
  state = "/var/lib/openchronology";
  # The settings as the server reads them: strings, with booleans as 1 and 0.
  environment = lib.mapAttrs (
    _: value: if lib.isBool value then (if value then "1" else "0") else toString value
  ) cfg.settings;
  # The systemd hardening of the Debian units.
  hardening = {
    NoNewPrivileges = true;
    PrivateTmp = true;
    ProtectSystem = "strict";
    ProtectHome = true;
    ProtectKernelTunables = true;
    ProtectControlGroups = true;
    RestrictSUIDSGID = true;
  };
  # A service running one of the package's commands as the openchronology user, with the
  # settings, the generated key and the administrator's environment file (which wins).
  service =
    {
      description,
      command,
      extra ? { },
    }:
    {
      inherit description;
      after = [
        "network.target"
        "openchronology-setup.service"
      ]
      ++ lib.optional cfg.database.createLocally "postgresql.service"
      ++ lib.optional (command != "openchronology-server") "openchronology.service";
      requires = [ "openchronology-setup.service" ];
      # The workers after the server, which migrates the database as it starts.
      wants = lib.optional (command != "openchronology-server") "openchronology.service";
      wantedBy = [ "multi-user.target" ];
      inherit environment;
      serviceConfig = hardening // {
        Type = "simple";
        User = "openchronology";
        Group = "openchronology";
        EnvironmentFile = [ "${state}/generated.env" ] ++ lib.optional (cfg.environmentFile != null) cfg.environmentFile;
        ExecStart = "${cfg.package}/bin/${command}";
        Restart = "on-failure";
        RestartSec = 5;
        # Node exits with 128 + SIGTERM when stopped; that is a clean stop, not a failure.
        SuccessExitStatus = 143;
        WorkingDirectory = "${cfg.package}/lib/openchronology";
      } // extra;
    };
in
{
  options.services.openchronology = {
    enable = mkEnableOption "OpenChronology, the exact timeline platform";

    package = mkOption {
      type = types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.openchronology-server;
      defaultText = lib.literalExpression "openchronology.packages.\${system}.openchronology-server";
      description = "The OpenChronology server package.";
    };

    origin = mkOption {
      type = types.str;
      example = "https://timelines.example.org";
      description = ''
        The public origin, exactly as people reach it, without a trailing slash (APP_ORIGIN).
        The server refuses an http:// origin other than localhost unless
        `settings.ALLOW_INSECURE_ORIGIN` is set.
      '';
    };

    host = mkOption {
      type = types.str;
      default = "127.0.0.1";
      description = "The address the server listens on (HOST). Keep it on loopback behind nginx.";
    };

    port = mkOption {
      type = types.port;
      default = 5173;
      description = "The port the server listens on (PORT).";
    };

    settings = mkOption {
      type = types.attrsOf (
        types.oneOf [
          types.str
          types.int
          types.bool
        ]
      );
      default = { };
      example = {
        PLATFORM_NAME = "Our timelines";
        TIMELINE_LINK_LIMIT = 5000;
        LANDING_PAGE = true;
      };
      description = ''
        Further configuration, as environment variables: any setting in
        deploy/debian-server/openchronology.env. Booleans become 1 and 0. Keep secrets
        (RESEND_API_KEY, ADMIN_INITIAL_PASSWORD, OAuth secrets) in `environmentFile`
        instead: these are written to the world-readable Nix store.
      '';
    };

    environmentFile = mkOption {
      type = types.nullOr types.path;
      default = null;
      example = "/run/secrets/openchronology.env";
      description = ''
        A file of KEY=value lines with secrets, read by every OpenChronology service and
        overriding `settings`. AUTH_ENCRYPTION_KEY may be given here; otherwise one is generated
        on first start in ${state}/generated.env (back it up apart from the database).
      '';
    };

    database = {
      createLocally = mkOption {
        type = types.bool;
        default = true;
        description = ''
          Run PostgreSQL on this machine with the pgmp extension, and create the database and
          its role (both named openchronology, reached by peer authentication over the Unix
          socket). Otherwise set DATABASE_URL in `settings` or `environmentFile`, to a database
          where a superuser has run CREATE EXTENSION pgmp.
        '';
      };
    };

    mail.enable = mkEnableOption ''
      the account email worker, which sends sign-up, sign-in and other account mail through
      Resend (RESEND_API_KEY and AUTH_EMAIL_FROM)
    '';

    syslog = {
      enable = mkEnableOption "the syslog receiver, which records syslog messages as timelines";
      settings = mkOption {
        type = types.attrsOf types.str;
        default = { };
        example = {
          SYSLOG_HOST = "0.0.0.0";
          SYSLOG_PORT = "5514";
          SYSLOG_ROUTES = "/etc/openchronology/syslog-routes.json";
        };
        description = ''
          Its configuration (deploy/debian-server/syslog.env). OCH_API_URL defaults to this
          server; give its OCH_API_KEY in `environmentFile`.
        '';
      };
    };

    journald = {
      enable = mkEnableOption "the journald follower, which records the systemd journal as timelines";
      settings = mkOption {
        type = types.attrsOf types.str;
        default = { };
        example = {
          JOURNALD_TIMELINE = "00000000-0000-0000-0000-000000000000";
          JOURNALD_UNITS = "nginx.service";
        };
        description = ''
          Its configuration (deploy/debian-server/journald.env). OCH_API_URL defaults to this
          server; give its OCH_API_KEY in `environmentFile`.
        '';
      };
    };

    nginx = {
      enable = mkEnableOption "an nginx virtual host in front of the server";
      hostName = mkOption {
        type = types.str;
        default = lib.head (lib.splitString ":" (lib.removePrefix "https://" (lib.removePrefix "http://" cfg.origin)));
        defaultText = lib.literalExpression "the host of `origin`";
        description = ''
          The virtual host's name. Set `services.nginx.virtualHosts.<name>.enableACME` and
          `forceSSL` for HTTPS.
        '';
      };
    };
  };

  config = mkIf cfg.enable (mkMerge [
    {
      services.openchronology.settings = {
        APP_ORIGIN = lib.mkDefault cfg.origin;
        HOST = lib.mkDefault cfg.host;
        PORT = lib.mkDefault cfg.port;
        # Downloads are cached in the service's cache directory (EXPORT_CACHE).
        EXPORT_CACHE_DIR = lib.mkDefault "/var/cache/openchronology";
      };

      users.users.openchronology = {
        isSystemUser = true;
        group = "openchronology";
        home = state;
        description = "OpenChronology server";
      };
      users.groups.openchronology = { };

      environment.systemPackages = [ cfg.package ];

      # Before the services: the encryption key, generated once, and pgmp in the database, which
      # only a superuser may create. The server migrates the database each time it starts.
      systemd.services.openchronology-setup = {
        description = "OpenChronology setup: its key and pgmp";
        after = [ "network.target" ] ++ lib.optionals cfg.database.createLocally [
          "postgresql.service"
          "postgresql-setup.service"
        ];
        requires = lib.optional cfg.database.createLocally "postgresql.service";
        serviceConfig = {
          Type = "oneshot";
          RemainAfterExit = true;
          StateDirectory = "openchronology";
          StateDirectoryMode = "0750";
        };
        path = [
          pkgs.util-linux
          pkgs.coreutils
        ];
        script = ''
          set -eu
          if [ ! -s ${state}/generated.env ]; then
            umask 0077
            echo "AUTH_ENCRYPTION_KEY=$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')" > ${state}/generated.env.new
            mv ${state}/generated.env.new ${state}/generated.env
          fi
          chown root:openchronology ${state}/generated.env
          chmod 0640 ${state}/generated.env
          ${lib.optionalString cfg.database.createLocally ''
            runuser -u postgres -- ${config.services.postgresql.package}/bin/psql -X -q \
              -v ON_ERROR_STOP=1 -d openchronology -c 'CREATE EXTENSION IF NOT EXISTS pgmp'
          ''}
        '';
      };

      systemd.services.openchronology = service {
        description = "OpenChronology platform";
        command = "openchronology-server";
        extra = {
          # The database brought up to this version's schema first (openchronology-migrate).
          ExecStartPre = "${cfg.package}/bin/openchronology-migrate";
          # Open live views keep the server from exiting promptly; do not wait long for them.
          TimeoutStopSec = 10;
          CacheDirectory = "openchronology";
        };
      };
    }

    (mkIf cfg.database.createLocally {
      services.postgresql = {
        enable = true;
        extensions = ps: [ (ps.callPackage ./pgmp.nix { }) ];
        ensureDatabases = [ "openchronology" ];
        ensureUsers = [
          {
            name = "openchronology";
            ensureDBOwnership = true;
          }
        ];
      };
      services.openchronology.settings.DATABASE_URL = lib.mkDefault "postgresql:///openchronology?host=/run/postgresql";
    })

    (mkIf cfg.mail.enable {
      systemd.services.openchronology-mail = service {
        description = "OpenChronology account email delivery (Resend)";
        command = "openchronology-mail";
      };
    })

    (mkIf cfg.syslog.enable {
      systemd.services.openchronology-syslog = lib.recursiveUpdate (service {
        description = "OpenChronology syslog receiver";
        command = "openchronology-syslog";
      }) { environment = { OCH_API_URL = "http://${cfg.host}:${toString cfg.port}"; } // cfg.syslog.settings; };
    })

    (mkIf cfg.journald.enable {
      systemd.services.openchronology-journald = lib.recursiveUpdate (service {
        description = "OpenChronology journald follower";
        command = "openchronology-journald";
        extra.SupplementaryGroups = [ "systemd-journal" ];
      }) { environment = { OCH_API_URL = "http://${cfg.host}:${toString cfg.port}"; } // cfg.journald.settings; };
    })

    (mkIf cfg.nginx.enable {
      # nginx replaces X-Forwarded-For with the client's address, so the server may trust it.
      services.openchronology.settings.TRUST_PROXY = lib.mkDefault true;
      services.nginx = {
        enable = true;
        # No nginx version in the Server header and error pages (#521); NixOS's default too.
        serverTokens = lib.mkDefault false;
        virtualHosts.${cfg.nginx.hostName}.locations."/" = {
          proxyPass = "http://${cfg.host}:${toString cfg.port}";
          proxyWebsockets = true;
          extraConfig = ''
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $remote_addr;
            proxy_set_header X-Forwarded-Proto $scheme;
            client_max_body_size 256m;
            proxy_buffering off;
            proxy_read_timeout 1h;
          '';
        };
      };
    })
  ]);
}
